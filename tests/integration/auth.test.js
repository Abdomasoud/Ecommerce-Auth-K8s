// Integration tests for authentication routes
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { TestDatabase, TestRedis, generateTestUser, expectValidationError, expectSuccessResponse } = require('../helpers');

describe('Authentication Routes Integration', () => {
  let testDb, testRedis;

  beforeAll(async () => {
    testDb = new TestDatabase();
    testRedis = new TestRedis();
    
    await testDb.connect();
    await testRedis.connect();
  });

  afterAll(async () => {
    await testDb.disconnect();
    await testRedis.disconnect();
  });

  beforeEach(async () => {
    await testDb.clearDatabase();
    await testRedis.flushAll();
    await testDb.seedDatabase();
  });

  describe('POST /api/auth/signup', () => {
    test('should create new user successfully', async () => {
      const userData = generateTestUser();

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData);

      expectSuccessResponse(response, 201);
      expect(response.body.message).toBe('User created successfully');
      expect(response.body.data.user.username).toBe(userData.username);
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.password_hash).toBeUndefined();
    });

    test('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({});

      expectValidationError(response, 'username');
    });

    test('should validate username format', async () => {
      const userData = generateTestUser({ username: 'invalid-username!' });

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData);

      expectValidationError(response, 'username');
    });

    test('should validate email format', async () => {
      const userData = generateTestUser({ email: 'invalid-email' });

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData);

      expectValidationError(response, 'email');
    });

    test('should validate password strength', async () => {
      const userData = generateTestUser({ password: 'weak' });

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData);

      expectValidationError(response, 'password');
    });

    test('should prevent duplicate email registration', async () => {
      const userData = generateTestUser({ email: 'test1@example.com' });

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User with this email or username already exists');
    });

    test('should prevent duplicate username registration', async () => {
      const userData = generateTestUser({ username: 'testuser1' });

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
    });

    test('should hash password before storing', async () => {
      const userData = generateTestUser();

      await request(app)
        .post('/api/auth/signup')
        .send(userData);

      // Check database for hashed password
      const user = await testDb.query('SELECT password_hash FROM users WHERE email = ?', [userData.email]);
      expect(user[0].password_hash).toBeDefined();
      expect(user[0].password_hash).not.toBe(userData.password);
      
      // Verify password hash
      const isValid = await bcrypt.compare(userData.password, user[0].password_hash);
      expect(isValid).toBe(true);
    });

    test('should cache user data after signup', async () => {
      const userData = generateTestUser();

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData);

      const userId = response.body.data.user.id;
      const cachedUser = await testRedis.get(`user:${userId}`);
      
      expect(cachedUser).toBeDefined();
      expect(cachedUser.username).toBe(userData.username);
    });
  });

  describe('POST /api/auth/login', () => {
    test('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test1@example.com',
          password: 'password123'
        });

      expectSuccessResponse(response);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.data.user.email).toBe('test1@example.com');
      expect(response.body.data.token).toBeDefined();
    });

    test('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid credentials');
    });

    test('should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test1@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid credentials');
    });

    test('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expectValidationError(response, 'email');
    });

    test('should update last login timestamp', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test1@example.com',
          password: 'password123'
        });

      const user = await testDb.query('SELECT last_login FROM users WHERE email = ?', ['test1@example.com']);
      expect(user[0].last_login).toBeDefined();
    });

    test('should cache user data after login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test1@example.com',
          password: 'password123'
        });

      const email = 'test1@example.com';
      const cachedUser = await testRedis.get(`user:email:${email}`);
      
      expect(cachedUser).toBeDefined();
      expect(cachedUser.email).toBe(email);
    });
  });

  describe('POST /api/auth/logout', () => {
    test('should logout successfully with valid token', async () => {
      // First login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test1@example.com',
          password: 'password123'
        });

      const token = loginResponse.body.data.token;

      // Then logout
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expectSuccessResponse(response);
      expect(response.body.message).toBe('Logout successful');
    });

    test('should require authentication for logout', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should blacklist token after logout', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test1@example.com',
          password: 'password123'
        });

      const token = loginResponse.body.data.token;

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      // Try to use the token again
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Token has been invalidated');
    });
  });

  describe('GET /api/auth/me', () => {
    test('should return current user data', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test1@example.com',
          password: 'password123'
        });

      const token = loginResponse.body.data.token;

      // Get current user
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expectSuccessResponse(response);
      expect(response.body.data.user.email).toBe('test1@example.com');
      expect(response.body.data.user.username).toBe('testuser1');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('JWT Token Validation', () => {
    test('should accept valid JWT token', async () => {
      const userId = 1;
      const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });

    test('should reject expired JWT token', async () => {
      const userId = 1;
      const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '-1h' });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    test('should reject token with invalid signature', async () => {
      const userId = 1;
      const token = jwt.sign({ userId }, 'wrong-secret', { expiresIn: '1h' });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });
  });
});
