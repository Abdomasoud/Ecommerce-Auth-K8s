const AWS = require('aws-sdk');
const fs = require('fs').promises;
const path = require('path');

// Cache for secrets to avoid repeated API calls
const secretsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Configure AWS SDK - moved to be called when needed
function configureAWS() {
  // Configure AWS SDK with credentials
  const awsConfig = {
    region: process.env.AWS_REGION || 'us-east-1'
  };

  // Add credentials if provided (for local development)
  // In production, use IAM roles instead of access keys
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    awsConfig.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    awsConfig.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    console.log('Using AWS credentials from environment variables');
  } else {
    console.log('Using AWS IAM role or instance profile for authentication');
  }

  // Configure AWS
  AWS.config.update(awsConfig);
  console.log('AWS SDK configured successfully');
  
  return new AWS.SecretsManager();
}

// Add the missing getSecret function
async function getSecret(secretName) {
  const cacheKey = secretName;
  const cached = secretsCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    console.log(`Using cached secret: ${secretName}`);
    return cached.data;
  }

  try {
    const secretsManager = configureAWS();
    const result = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
    
    let secretData;
    if (result.SecretString) {
      secretData = JSON.parse(result.SecretString);
    } else {
      throw new Error('Secret value is not a string');
    }

    // Cache the secret
    secretsCache.set(cacheKey, {
      data: secretData,
      timestamp: Date.now()
    });

    console.log(`Successfully fetched secret: ${secretName}`);
    return secretData;
  } catch (error) {
    console.error(`Failed to fetch secret ${secretName}:`, error.message);
    throw error;
  }
}

// New function to read secrets from CSI mounted files
async function loadFromCSIMountedFiles() {
  console.log('Loading configuration from CSI mounted secret files...');
  
  try {
    const secretsPath = '/tmp';
    
    // Read all secret files
    const [dbHost, dbUser, dbPassword, dbName, dbPort, redisHost, redisPort, redisPassword, jwtSecret, sessionSecret] = await Promise.all([
      fs.readFile(path.join(secretsPath, 'DB_HOST'), 'utf8').catch(() => 'localhost'),
      fs.readFile(path.join(secretsPath, 'DB_USER'), 'utf8').catch(() => 'ecommerce_user'),
      fs.readFile(path.join(secretsPath, 'DB_PASSWORD'), 'utf8').catch(() => ''),
      fs.readFile(path.join(secretsPath, 'DB_NAME'), 'utf8').catch(() => 'ecommerce_db'),
      fs.readFile(path.join(secretsPath, 'DB_PORT'), 'utf8').catch(() => '5432'),
      fs.readFile(path.join(secretsPath, 'REDIS_HOST'), 'utf8').catch(() => 'localhost'),
      fs.readFile(path.join(secretsPath, 'REDIS_PORT'), 'utf8').catch(() => '6379'),
      fs.readFile(path.join(secretsPath, 'REDIS_PASSWORD'), 'utf8').catch(() => ''),
      fs.readFile(path.join(secretsPath, 'JWT_SECRET'), 'utf8').catch(() => 'your-jwt-secret-key'),
      fs.readFile(path.join(secretsPath, 'SESSION_SECRET'), 'utf8').catch(() => 'your-session-secret')
    ]);

    const config = {
      // Database configuration from mounted files
      DB_HOST: dbHost.trim(),
      DB_USER: dbUser.trim(),
      DB_PASSWORD: dbPassword.trim(),
      DB_NAME: dbName.trim(),
      DB_PORT: parseInt(dbPort.trim()) || 5432,

      // Redis configuration from mounted files
      REDIS_HOST: redisHost.trim(),
      REDIS_PORT: parseInt(redisPort.trim()) || 6379,
      REDIS_PASSWORD: redisPassword.trim(),
      REDIS_TLS: 'false',

      // Application secrets from mounted files
      JWT_SECRET: jwtSecret.trim(),
      JWT_EXPIRES_IN: '7d',
      SESSION_SECRET: sessionSecret.trim(),
      SESSION_MAX_AGE: 86400000,

      // Other configuration
      NODE_ENV: process.env.NODE_ENV || 'production',
      PORT: process.env.PORT || 3000,
      AWS_REGION: process.env.AWS_REGION || 'us-east-1'
    };

    console.log('Database config:', {
      host: config.DB_HOST,
      port: config.DB_PORT,
      database: config.DB_NAME,
      user: config.DB_USER,
      hasPassword: !!config.DB_PASSWORD
    });
    
    console.log('Redis config:', {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      hasPassword: !!config.REDIS_PASSWORD
    });

    console.log('Configuration loaded from CSI mounted files successfully');
    return config;
  } catch (error) {
    console.error('Failed to load from CSI mounted files:', error.message);
    throw error;
  }
}

// Main configuration loader
async function loadConfig() {
  const useSecretsManager = process.env.USE_SECRETS_MANAGER === 'true';
  const useCSIDriver = process.env.USE_CSI_DRIVER === 'true';
  
  console.log(`Loading configuration... Secrets Manager: ${useSecretsManager}, CSI Driver: ${useCSIDriver}`);

  // Priority: CSI Driver > Secrets Manager > Environment Variables
  if (useCSIDriver) {
    try {
      return await loadFromCSIMountedFiles();
    } catch (error) {
      console.error('Failed to load from CSI driver:', error.message);
      console.log('Falling back to other methods...');
    }
  }

  if (useSecretsManager) {
    try {
      // Configure AWS SDK first before attempting to load secrets
      console.log('Configuring AWS SDK...');
      configureAWS();
      
      // Define secret names (these should match your AWS Secrets Manager secret names)
      const DB_SECRET_NAME = process.env.DB_SECRET_NAME || 'ecommerce/prod/database';
      const REDIS_SECRET_NAME = process.env.REDIS_SECRET_NAME || 'ecommerce/prod/redis';
      const APP_SECRET_NAME = process.env.APP_SECRET_NAME || 'ecommerce/prod/app-config';

      console.log('Fetching secrets from AWS Secrets Manager...');
      
      // Fetch secrets from AWS Secrets Manager
      const [dbSecrets, redisSecrets, appSecrets] = await Promise.all([
        getSecret(DB_SECRET_NAME),
        getSecret(REDIS_SECRET_NAME),
        getSecret(APP_SECRET_NAME)
      ]);

      console.log('Successfully fetched all secrets from AWS Secrets Manager');

      return {
        // Database configuration from Secrets Manager
        DB_HOST: (dbSecrets.host || dbSecrets.hostname).split(':')[0],
        DB_USER: dbSecrets.username || dbSecrets.user,
        DB_PASSWORD: dbSecrets.password,
        DB_NAME: dbSecrets.dbname || dbSecrets.database || 'ecommerce_db',
        DB_PORT: dbSecrets.port || 5432,

        // Redis configuration from Secrets Manager
        REDIS_HOST: (redisSecrets.host || redisSecrets.hostname).includes(':') 
          ? (redisSecrets.host || redisSecrets.hostname).split(':')[0] 
          : (redisSecrets.host || redisSecrets.hostname),
        REDIS_PORT: redisSecrets.port || 6379,
        REDIS_PASSWORD: redisSecrets.password || redisSecrets.auth_token,
        REDIS_TLS: redisSecrets.tls || redisSecrets.ssl_enabled || 'true',

        // Application secrets
        JWT_SECRET: appSecrets.jwt_secret,
        JWT_EXPIRES_IN: appSecrets.jwt_expires_in || '7d',
        SESSION_SECRET: appSecrets.session_secret,
        SESSION_MAX_AGE: appSecrets.session_max_age || 86400000,

        // Other configuration
        NODE_ENV: process.env.NODE_ENV || 'production',
        PORT: process.env.PORT || 3000,
        AWS_REGION: process.env.AWS_REGION || 'us-east-1'
      };
    } catch (error) {
      console.error('Failed to load secrets from AWS Secrets Manager:', error.message);
      console.log('Falling back to environment variables...');
      return loadFromEnvironment();
    }
  } else {
    console.log('Using environment variables for configuration (Kubernetes deployment mode)');
    return loadFromEnvironment();
  }
}

function loadFromEnvironment() {
  console.log('Loading configuration from environment variables...');
  
  const config = {
    // Database configuration - direct from environment
    DB_HOST: process.env.DB_HOST || 'postgres-service',
    DB_USER: process.env.DB_USER || 'ecommerce_user',
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_NAME: process.env.DB_NAME || 'ecommerce_db',
    DB_PORT: process.env.DB_PORT || 5432,

    // Redis configuration - direct from environment
    REDIS_HOST: process.env.REDIS_HOST || 'redis-service',
    REDIS_PORT: process.env.REDIS_PORT || 6379,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
    REDIS_TLS: process.env.REDIS_TLS || 'false',

    // Application secrets - direct from environment
    JWT_SECRET: process.env.JWT_SECRET || 'your-jwt-secret-key',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    SESSION_SECRET: process.env.SESSION_SECRET || 'your-session-secret',
    SESSION_MAX_AGE: process.env.SESSION_MAX_AGE || 86400000,

    // Other configuration
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 3000,
    AWS_REGION: process.env.AWS_REGION || 'us-east-1'
  };

  // Validate required fields for Kubernetes deployment
  const requiredFields = ['DB_PASSWORD'];
  const missingFields = requiredFields.filter(field => !config[field]);
  
  if (missingFields.length > 0) {
    console.warn(`Warning: Missing required environment variables: ${missingFields.join(', ')}`);
  }

  console.log('Database config:', {
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_USER
  });
  
  console.log('Redis config:', {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    tls: config.REDIS_TLS,
    hasPassword: !!config.REDIS_PASSWORD
  });

  console.log('Configuration loaded from environment variables successfully');
  return config;
}

// Global configuration object
let config = null;

async function initializeConfig() {
  if (!config) {
    console.log('Loading configuration for the first time...');
    config = await loadConfig();
    
    if (!config) {
      throw new Error('Failed to load configuration - config is null');
    }
    
    console.log('Configuration loaded successfully');
  }
  return config;
}

function getConfig() {
  if (!config) {
    throw new Error('Configuration not initialized. Call initializeConfig() first.');
  }
  return config;
}

module.exports = {
  initializeConfig,
  getConfig,
  getSecret
};