// Unit tests for authentication middleware
const jwt = require('jsonwebtoken');
const authMiddleware = require('../../middleware/auth');
const { cache } = require('../../config/redis');
const { query } = require('../../config/database');
const { generateJWT } = require('../helpers');

// Mock dependencies
jest.mock('../../config/redis');
jest.mock('../../config/database');
jest.mock('jsonwebtoken');

describe('Authentication Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      header: jest.fn(),
      session: {}
    };
    res = {
      status: jest.fn(() => res),
      json: jest.fn()
    };
    next = jest.fn();

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Token Validation', () => {
    test('should authenticate valid token from Authorization header', async () => {
      const token = 'valid-token';
      const decoded = { userId: 1 };
      const userData = { id: 1, username: 'testuser', email: 'test@example.com' };

      req.header.mockReturnValue(`Bearer ${token}`);
      cache.exists.mockResolvedValue(false); // Token not blacklisted
      jwt.verify.mockReturnValue(decoded);
      cache.get.mockResolvedValue(userData);

      await authMiddleware(req, res, next);

      expect(req.user).toEqual(userData);
      expect(req.token).toBe(token);
      expect(next).toHaveBeenCalled();
    });

    test('should authenticate valid token from session', async () => {
      const token = 'session-token';
      const decoded = { userId: 1 };
      const userData = { id: 1, username: 'testuser', email: 'test@example.com' };

      req.header.mockReturnValue(null);
      req.session.token = token;
      cache.exists.mockResolvedValue(false);
      jwt.verify.mockReturnValue(decoded);
      cache.get.mockResolvedValue(userData);

      await authMiddleware(req, res, next);

      expect(req.user).toEqual(userData);
      expect(req.token).toBe(token);
      expect(next).toHaveBeenCalled();
    });

    test('should reject request without token', async () => {
      req.header.mockReturnValue(null);

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No token provided, authorization denied'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject blacklisted token', async () => {
      const token = 'blacklisted-token';
      
      req.header.mockReturnValue(`Bearer ${token}`);
      cache.exists.mockResolvedValue(true); // Token is blacklisted

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token has been invalidated'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject invalid token', async () => {
      const token = 'invalid-token';
      
      req.header.mockReturnValue(`Bearer ${token}`);
      cache.exists.mockResolvedValue(false);
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token is not valid'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('User Data Retrieval', () => {
    test('should use cached user data when available', async () => {
      const token = 'valid-token';
      const decoded = { userId: 1 };
      const cachedUser = { id: 1, username: 'testuser', email: 'test@example.com' };

      req.header.mockReturnValue(`Bearer ${token}`);
      cache.exists.mockResolvedValue(false);
      jwt.verify.mockReturnValue(decoded);
      cache.get.mockResolvedValue(cachedUser);

      await authMiddleware(req, res, next);

      expect(cache.get).toHaveBeenCalledWith('user:1');
      expect(query).not.toHaveBeenCalled();
      expect(req.user).toEqual(cachedUser);
      expect(next).toHaveBeenCalled();
    });

    test('should fetch user from database when not cached', async () => {
      const token = 'valid-token';
      const decoded = { userId: 1 };
      const dbUser = { id: 1, username: 'testuser', email: 'test@example.com' };

      req.header.mockReturnValue(`Bearer ${token}`);
      cache.exists.mockResolvedValue(false);
      jwt.verify.mockReturnValue(decoded);
      cache.get.mockResolvedValue(null); // Not in cache
      query.mockResolvedValue([dbUser]);
      cache.set.mockResolvedValue(true);

      await authMiddleware(req, res, next);

      expect(query).toHaveBeenCalledWith(
        'SELECT id, username, email, created_at, updated_at FROM users WHERE id = ?',
        [1]
      );
      expect(cache.set).toHaveBeenCalledWith('user:1', dbUser, 3600);
      expect(req.user).toEqual(dbUser);
      expect(next).toHaveBeenCalled();
    });

    test('should reject when user not found in database', async () => {
      const token = 'valid-token';
      const decoded = { userId: 999 };

      req.header.mockReturnValue(`Bearer ${token}`);
      cache.exists.mockResolvedValue(false);
      jwt.verify.mockReturnValue(decoded);
      cache.get.mockResolvedValue(null);
      query.mockResolvedValue([]); // User not found

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not found'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      const token = 'valid-token';
      const decoded = { userId: 1 };
      const dbError = new Error('Database connection failed');

      req.header.mockReturnValue(`Bearer ${token}`);
      cache.exists.mockResolvedValue(false);
      jwt.verify.mockReturnValue(decoded);
      cache.get.mockResolvedValue(null);
      query.mockRejectedValue(dbError);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await authMiddleware(req, res, next);

      expect(consoleSpy).toHaveBeenCalledWith('Auth middleware error:', dbError);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token is not valid'
      });

      consoleSpy.mockRestore();
    });

    test('should handle cache errors gracefully', async () => {
      const token = 'valid-token';
      const decoded = { userId: 1 };
      const cacheError = new Error('Redis connection failed');

      req.header.mockReturnValue(`Bearer ${token}`);
      cache.exists.mockRejectedValue(cacheError);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await authMiddleware(req, res, next);

      expect(consoleSpy).toHaveBeenCalledWith('Auth middleware error:', cacheError);
      expect(res.status).toHaveBeenCalledWith(401);

      consoleSpy.mockRestore();
    });

    test('should handle JWT verification errors', async () => {
      const token = 'malformed-token';
      const jwtError = new Error('jwt malformed');

      req.header.mockReturnValue(`Bearer ${token}`);
      cache.exists.mockResolvedValue(false);
      jwt.verify.mockImplementation(() => {
        throw jwtError;
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await authMiddleware(req, res, next);

      expect(consoleSpy).toHaveBeenCalledWith('Auth middleware error:', jwtError);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token is not valid'
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Token Extraction', () => {
    test('should extract token from Authorization header with Bearer prefix', async () => {
      const token = 'test-token';
      const decoded = { userId: 1 };
      const userData = { id: 1, username: 'testuser' };

      req.header.mockReturnValue(`Bearer ${token}`);
      cache.exists.mockResolvedValue(false);
      jwt.verify.mockReturnValue(decoded);
      cache.get.mockResolvedValue(userData);

      await authMiddleware(req, res, next);

      expect(req.token).toBe(token);
      expect(next).toHaveBeenCalled();
    });

    test('should prioritize Authorization header over session token', async () => {
      const headerToken = 'header-token';
      const sessionToken = 'session-token';
      const decoded = { userId: 1 };
      const userData = { id: 1, username: 'testuser' };

      req.header.mockReturnValue(`Bearer ${headerToken}`);
      req.session.token = sessionToken;
      cache.exists.mockResolvedValue(false);
      jwt.verify.mockReturnValue(decoded);
      cache.get.mockResolvedValue(userData);

      await authMiddleware(req, res, next);

      expect(req.token).toBe(headerToken);
      expect(next).toHaveBeenCalled();
    });
  });
});
