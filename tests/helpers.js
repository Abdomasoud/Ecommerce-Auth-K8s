// Test helpers and utilities
const { Pool } = require('pg');
const redis = require('redis');
const jwt = require('jsonwebtoken');

class TestDatabase {
  constructor() {
    this.pool = null;
  }

  async connect() {
    this.pool = new Pool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  async query(sql, params = []) {
    if (!this.pool) {
      await this.connect();
    }
    const result = await this.pool.query(sql, params);
    return result.rows;
  }

  async clearDatabase() {
    const tables = ['order_items', 'orders', 'user_profiles', 'users', 'products', 'sessions'];
    
    for (const table of tables) {
      try {
        await this.query(`DELETE FROM ${table}`);
        await this.query(`ALTER SEQUENCE ${table}_id_seq RESTART WITH 1`);
      } catch (error) {
        // Table might not exist or doesn't have a sequence, continue
      }
    }
  }

  async seedDatabase() {
    // Insert test users
    await this.query(`
      INSERT INTO users (username, email, password_hash, created_at) VALUES
      ('testuser1', 'test1@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewlMJIKhYdCPQBJq', CURRENT_TIMESTAMP),
      ('testuser2', 'test2@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewlMJIKhYdCPQBJq', CURRENT_TIMESTAMP),
      ('testuser3', 'test3@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewlMJIKhYdCPQBJq', CURRENT_TIMESTAMP)
    `);

    // Insert test products
    await this.query(`
      INSERT INTO products (name, description, price, category, stock_quantity, created_at) VALUES
      ('Test Product 1', 'Test product description 1', 29.99, 'Electronics', 10, CURRENT_TIMESTAMP),
      ('Test Product 2', 'Test product description 2', 39.99, 'Electronics', 5, CURRENT_TIMESTAMP),
      ('Test Product 3', 'Test product description 3', 19.99, 'Books', 15, CURRENT_TIMESTAMP),
      ('Test Product 4', 'Test product description 4', 49.99, 'Sports', 8, CURRENT_TIMESTAMP),
      ('Test Product 5', 'Test product description 5', 24.99, 'Home', 12, CURRENT_TIMESTAMP)
    `);

    // Insert test user profiles
    await this.query(`
      INSERT INTO user_profiles (user_id, first_name, last_name, phone, bio, created_at) VALUES
      (1, 'John', 'Doe', '+1234567890', 'Test user 1 bio', CURRENT_TIMESTAMP),
      (2, 'Jane', 'Smith', '+1234567891', 'Test user 2 bio', CURRENT_TIMESTAMP)
    `);

    // Insert test orders
    await this.query(`
      INSERT INTO orders (user_id, total_amount, status, created_at) VALUES
      (1, 59.98, 'pending', CURRENT_TIMESTAMP),
      (1, 19.99, 'completed', CURRENT_TIMESTAMP),
      (2, 49.99, 'pending', CURRENT_TIMESTAMP)
    `);

    // Insert test order items
    await this.query(`
      INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, created_at) VALUES
      (1, 1, 2, 29.99, 59.98, CURRENT_TIMESTAMP),
      (2, 3, 1, 19.99, 19.99, CURRENT_TIMESTAMP),
      (3, 4, 1, 49.99, 49.99, CURRENT_TIMESTAMP)
    `);
  }
}

class TestRedis {
  constructor() {
    this.client = null;
  }

  async connect() {
    this.client = redis.createClient({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD
    });
    await this.client.connect();
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
    }
  }

  async flushAll() {
    if (this.client) {
      await this.client.flushAll();
    }
  }

  async set(key, value, expiration = 3600) {
    await this.client.setEx(key, expiration, JSON.stringify(value));
  }

  async get(key) {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }
}

// Test data generators
function generateTestUser(overrides = {}) {
  return {
    username: 'testuser' + Math.random().toString(36).substr(2, 9),
    email: 'test' + Math.random().toString(36).substr(2, 9) + '@example.com',
    password: 'TestPassword123',
    ...overrides
  };
}

function generateTestProduct(overrides = {}) {
  return {
    name: 'Test Product ' + Math.random().toString(36).substr(2, 9),
    description: 'Test product description',
    price: Math.floor(Math.random() * 100) + 10,
    category: 'Electronics',
    stock_quantity: Math.floor(Math.random() * 20) + 1,
    ...overrides
  };
}

function generateJWT(userId, secret = process.env.JWT_SECRET) {
  return jwt.sign({ userId }, secret, { expiresIn: '1h' });
}

// Mock functions
function mockRedisClient() {
  const mockClient = {
    get: jest.fn(),
    set: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    connect: jest.fn(),
    quit: jest.fn(),
    flushAll: jest.fn()
  };
  
  return mockClient;
}

function mockDatabaseConnection() {
  const mockConnection = {
    execute: jest.fn(),
    query: jest.fn(),
    end: jest.fn()
  };
  
  return mockConnection;
}

// Test assertions helpers
function expectValidationError(response, field) {
  expect(response.status).toBe(400);
  expect(response.body.success).toBe(false);
  expect(response.body.message).toBe('Validation errors');
  expect(response.body.errors).toBeDefined();
  expect(response.body.errors.some(error => error.param === field)).toBe(true);
}

function expectAuthError(response) {
  expect(response.status).toBe(401);
  expect(response.body.success).toBe(false);
  expect(response.body.message).toContain('authorization');
}

function expectSuccessResponse(response, statusCode = 200) {
  expect(response.status).toBe(statusCode);
  expect(response.body.success).toBe(true);
  expect(response.body.data).toBeDefined();
}

module.exports = {
  TestDatabase,
  TestRedis,
  generateTestUser,
  generateTestProduct,
  generateJWT,
  mockRedisClient,
  mockDatabaseConnection,
  expectValidationError,
  expectAuthError,
  expectSuccessResponse
};
