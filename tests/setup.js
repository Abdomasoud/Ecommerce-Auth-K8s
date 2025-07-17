// Test setup file - runs before all tests
const AWS = require('aws-sdk-mock');

// Mock AWS Services
AWS.mock('SecretsManager', 'getSecretValue', (params, callback) => {
  let secretValue;
  
  switch (params.SecretId) {
    case 'user-auth-app/database':
      secretValue = {
        SecretString: JSON.stringify({
          host: 'localhost',
          username: 'testuser',
          password: 'testpass',
          database: 'test_db',
          port: 5432
        })
      };
      break;
    case 'user-auth-app/redis':
      secretValue = {
        SecretString: JSON.stringify({
          host: 'localhost',
          port: 6379,
          password: 'testredispass'
        })
      };
      break;
    case 'user-auth-app/application':
      secretValue = {
        SecretString: JSON.stringify({
          jwt_secret: 'test-jwt-secret',
          jwt_expires_in: '7d',
          session_secret: 'test-session-secret',
          session_max_age: 86400000
        })
      };
      break;
    default:
      return callback(new Error('Secret not found'));
  }
  
  callback(null, secretValue);
});

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.USE_SECRETS_MANAGER = 'false';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'testuser';
process.env.DB_PASSWORD = 'testpass';
process.env.DB_NAME = 'test_db';
process.env.DB_PORT = '5432';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PASSWORD = 'testredispass';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = '7d';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.SESSION_MAX_AGE = '86400000';
process.env.PORT = '3001';
process.env.AWS_REGION = 'us-east-1';

// Increase timeout for database operations
jest.setTimeout(30000);

// Global test database and Redis cleanup
afterAll(async () => {
  // Clean up any open connections
  if (global.testServer) {
    await global.testServer.close();
  }
});

// Suppress console logs during tests unless debugging
if (process.env.NODE_ENV === 'test' && !process.env.DEBUG) {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
}
