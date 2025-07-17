// Unit tests for secrets configuration
const AWS = require('aws-sdk-mock');
const { initializeConfig, getConfig, getSecret } = require('../../config/secrets');

describe('Secrets Configuration', () => {
  beforeEach(() => {
    // Reset configuration
    jest.resetModules();
    delete require.cache[require.resolve('../../config/secrets')];
  });

  afterEach(() => {
    AWS.restore();
  });

  describe('Environment Variables Mode', () => {
    test('should load configuration from environment variables', async () => {
      process.env.USE_SECRETS_MANAGER = 'false';
      process.env.DB_HOST = 'localhost';
      process.env.DB_USER = 'testuser';
      process.env.JWT_SECRET = 'test-jwt-secret';

      const config = await initializeConfig();

      expect(config.DB_HOST).toBe('localhost');
      expect(config.DB_USER).toBe('testuser');
      expect(config.JWT_SECRET).toBe('test-jwt-secret');
    });

    test('should use default values when environment variables are missing', async () => {
      delete process.env.DB_PORT;
      delete process.env.JWT_EXPIRES_IN;
      
      const config = await initializeConfig();

      expect(config.DB_PORT).toBe(3306);
      expect(config.JWT_EXPIRES_IN).toBe('7d');
    });
  });

  describe('AWS Secrets Manager Mode', () => {
    test('should load configuration from AWS Secrets Manager', async () => {
      process.env.USE_SECRETS_MANAGER = 'true';
      process.env.NODE_ENV = 'production';

      // Mock AWS Secrets Manager
      AWS.mock('SecretsManager', 'getSecretValue', (params, callback) => {
        let secretValue;
        
        switch (params.SecretId) {
          case 'user-auth-app/database':
            secretValue = {
              SecretString: JSON.stringify({
                host: 'prod-rds-endpoint.amazonaws.com',
                username: 'produser',
                password: 'prodpass',
                database: 'prod_db',
                port: 3306
              })
            };
            break;
          case 'user-auth-app/redis':
            secretValue = {
              SecretString: JSON.stringify({
                host: 'prod-redis-endpoint.amazonaws.com',
                port: 6379,
                password: 'prodredispass'
              })
            };
            break;
          case 'user-auth-app/application':
            secretValue = {
              SecretString: JSON.stringify({
                jwt_secret: 'prod-jwt-secret',
                jwt_expires_in: '7d',
                session_secret: 'prod-session-secret',
                session_max_age: 86400000
              })
            };
            break;
          default:
            return callback(new Error('Secret not found'));
        }
        
        callback(null, secretValue);
      });

      const config = await initializeConfig();

      expect(config.DB_HOST).toBe('prod-rds-endpoint.amazonaws.com');
      expect(config.DB_USER).toBe('produser');
      expect(config.REDIS_HOST).toBe('prod-redis-endpoint.amazonaws.com');
      expect(config.JWT_SECRET).toBe('prod-jwt-secret');
    });

    test('should fallback to environment variables when Secrets Manager fails', async () => {
      process.env.USE_SECRETS_MANAGER = 'true';
      process.env.DB_HOST = 'fallback-host';
      process.env.JWT_SECRET = 'fallback-jwt-secret';

      // Mock AWS Secrets Manager to fail
      AWS.mock('SecretsManager', 'getSecretValue', (params, callback) => {
        callback(new Error('Secrets Manager unavailable'));
      });

      const config = await initializeConfig();

      expect(config.DB_HOST).toBe('fallback-host');
      expect(config.JWT_SECRET).toBe('fallback-jwt-secret');
    });

    test('should cache secrets to avoid repeated API calls', async () => {
      process.env.USE_SECRETS_MANAGER = 'true';
      
      let callCount = 0;
      AWS.mock('SecretsManager', 'getSecretValue', (params, callback) => {
        callCount++;
        callback(null, {
          SecretString: JSON.stringify({ test: 'value' })
        });
      });

      // First call
      await getSecret('test-secret');
      expect(callCount).toBe(1);

      // Second call should use cache
      await getSecret('test-secret');
      expect(callCount).toBe(1);
    });
  });

  describe('Configuration Validation', () => {
    test('should throw error when configuration is accessed before initialization', () => {
      expect(() => getConfig()).toThrow('Configuration not initialized');
    });

    test('should validate required configuration fields', async () => {
      delete process.env.DB_HOST;
      delete process.env.JWT_SECRET;
      
      const config = await initializeConfig();
      
      expect(config.DB_HOST).toBeUndefined();
      expect(config.JWT_SECRET).toBeUndefined();
    });
  });

  describe('Production vs Development', () => {
    test('should use Secrets Manager in production by default', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.USE_SECRETS_MANAGER;

      AWS.mock('SecretsManager', 'getSecretValue', (params, callback) => {
        callback(null, {
          SecretString: JSON.stringify({ host: 'prod-host' })
        });
      });

      const config = await initializeConfig();
      expect(config.DB_HOST).toBe('prod-host');
    });

    test('should use environment variables in development by default', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.USE_SECRETS_MANAGER;
      process.env.DB_HOST = 'dev-host';

      const config = await initializeConfig();
      expect(config.DB_HOST).toBe('dev-host');
    });
  });
});
