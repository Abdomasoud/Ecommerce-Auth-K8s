// Unit tests for Redis configuration
const redis = require('redis');
const { cache } = require('../../config/redis');
const { mockRedisClient } = require('../helpers');

// Mock redis
jest.mock('redis');

describe('Redis Configuration', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = mockRedisClient();
    redis.createClient = jest.fn().mockReturnValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Redis Client Creation', () => {
    test('should create Redis client with correct configuration', () => {
      const client = redis.createClient();

      expect(redis.createClient).toHaveBeenCalledWith({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        retryDelayOnFailover: 100,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 3
      });
    });

    test('should handle Redis connection events', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Simulate connection events
      mockClient.on.mockImplementation((event, callback) => {
        if (event === 'connect') {
          callback();
        }
      });

      redis.createClient();
      
      expect(consoleSpy).toHaveBeenCalledWith('Redis Client Connected');
      consoleSpy.mockRestore();
    });

    test('should handle Redis error events', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const testError = new Error('Redis connection failed');
      
      mockClient.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          callback(testError);
        }
      });

      redis.createClient();
      
      expect(consoleSpy).toHaveBeenCalledWith('Redis Client Error:', testError);
      consoleSpy.mockRestore();
    });
  });

  describe('Cache Operations', () => {
    beforeEach(() => {
      // Reset the module to get fresh cache instance
      jest.resetModules();
      delete require.cache[require.resolve('../../config/redis')];
    });

    test('should get cached value', async () => {
      const testValue = { user: 'test', id: 1 };
      mockClient.get.mockResolvedValue(JSON.stringify(testValue));

      const result = await cache.get('test-key');

      expect(mockClient.get).toHaveBeenCalledWith('test-key');
      expect(result).toEqual(testValue);
    });

    test('should return null for non-existent key', async () => {
      mockClient.get.mockResolvedValue(null);

      const result = await cache.get('non-existent-key');

      expect(result).toBeNull();
    });

    test('should handle get errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockClient.get.mockRejectedValue(new Error('Redis GET failed'));

      const result = await cache.get('error-key');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Redis GET error:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    test('should set cached value with expiration', async () => {
      const testValue = { user: 'test', id: 1 };
      mockClient.setEx.mockResolvedValue('OK');

      const result = await cache.set('test-key', testValue, 1800);

      expect(mockClient.setEx).toHaveBeenCalledWith('test-key', 1800, JSON.stringify(testValue));
      expect(result).toBe(true);
    });

    test('should use default expiration when not specified', async () => {
      const testValue = { user: 'test' };
      mockClient.setEx.mockResolvedValue('OK');

      await cache.set('test-key', testValue);

      expect(mockClient.setEx).toHaveBeenCalledWith('test-key', 3600, JSON.stringify(testValue));
    });

    test('should handle set errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockClient.setEx.mockRejectedValue(new Error('Redis SET failed'));

      const result = await cache.set('error-key', { test: 'value' });

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Redis SET error:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    test('should delete cached value', async () => {
      mockClient.del.mockResolvedValue(1);

      const result = await cache.del('test-key');

      expect(mockClient.del).toHaveBeenCalledWith('test-key');
      expect(result).toBe(true);
    });

    test('should handle delete errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockClient.del.mockRejectedValue(new Error('Redis DEL failed'));

      const result = await cache.del('error-key');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Redis DEL error:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    test('should check if key exists', async () => {
      mockClient.exists.mockResolvedValue(1);

      const result = await cache.exists('test-key');

      expect(mockClient.exists).toHaveBeenCalledWith('test-key');
      expect(result).toBe(1);
    });

    test('should handle exists errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockClient.exists.mockRejectedValue(new Error('Redis EXISTS failed'));

      const result = await cache.exists('error-key');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Redis EXISTS error:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('Redis Client Singleton', () => {
    test('should reuse the same client instance', () => {
      const { redisClient: client1 } = require('../../config/redis');
      const { redisClient: client2 } = require('../../config/redis');

      expect(client1).toBe(client2);
    });

    test('should create client only once', () => {
      require('../../config/redis');
      require('../../config/redis');

      expect(redis.createClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('Connection Management', () => {
    test('should handle connection and disconnection', async () => {
      mockClient.connect = jest.fn().mockResolvedValue();
      mockClient.quit = jest.fn().mockResolvedValue();

      await mockClient.connect();
      await mockClient.quit();

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.quit).toHaveBeenCalled();
    });

    test('should handle connection failures', async () => {
      mockClient.connect = jest.fn().mockRejectedValue(new Error('Connection failed'));

      await expect(mockClient.connect()).rejects.toThrow('Connection failed');
    });
  });
});
