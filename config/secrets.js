const AWS = require('aws-sdk');

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

async function getSecret(secretName) {
  try {
    // Check cache first
    const cached = secretsCache.get(secretName);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`Using cached secret: ${secretName}`);
      return cached.value;
    }

    console.log(`Fetching secret from AWS Secrets Manager: ${secretName}`);
    
    // Configure AWS SDK when needed
    const secretsManager = configureAWS();
    
    // For production, we prefer IAM roles, but check if credentials are configured
    if (process.env.NODE_ENV !== 'production' && (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY)) {
      console.warn('Warning: AWS credentials not configured. Make sure IAM role is properly configured or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    }

    const result = await secretsManager.getSecretValue({
      SecretId: secretName
    }).promise();

    let secretValue;
    if (result.SecretString) {
      secretValue = JSON.parse(result.SecretString);
    } else {
      // Handle binary secrets if needed
      secretValue = Buffer.from(result.SecretBinary, 'base64').toString('ascii');
    }

    // Cache the secret
    secretsCache.set(secretName, {
      value: secretValue,
      timestamp: Date.now()
    });

    console.log(`Successfully fetched secret: ${secretName}`);
    return secretValue;
  } catch (error) {
    console.error(`Error fetching secret ${secretName}:`, error.message);
    
    // Better error messages for common issues
    if (error.code === 'ResourceNotFoundException') {
      throw new Error(`Secret ${secretName} not found in AWS Secrets Manager. Please verify the secret name exists in region ${process.env.AWS_REGION || 'us-east-1'}`);
    } else if (error.code === 'UnauthorizedOperation' || error.code === 'AccessDenied') {
      throw new Error(`Access denied to secret ${secretName}. Check IAM permissions for SecretsManager:GetSecretValue`);
    } else if (error.code === 'InvalidSignatureException') {
      throw new Error('Invalid AWS credentials. Please check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY or IAM role permissions.');
    } else if (error.code === 'TokenRefreshRequired') {
      throw new Error('AWS token refresh required. This usually happens with temporary credentials.');
    } else if (error.code === 'NetworkingError') {
      throw new Error(`Network error accessing AWS Secrets Manager: ${error.message}`);
    } else {
      throw new Error(`Failed to fetch secret ${secretName}: ${error.message}`);
    }
  }
}

async function getSecretValue(secretName, key) {
  try {
    const secret = await getSecret(secretName);
    return secret[key];
  } catch (error) {
    console.error(`Error getting secret value for ${secretName}:${key}:`, error);
    throw error;
  }
}

// Main configuration loader
async function loadConfig() {
  const isProduction = process.env.NODE_ENV === 'productionz';
  const useSecretsManager = process.env.USE_SECRETS_MANAGER === 'true' || isProduction;
  
  console.log(`Loading configuration... Production: ${isProduction}, Secrets Manager: ${useSecretsManager}`);

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
      console.log(`Database Secret: ${DB_SECRET_NAME}`);
      console.log(`Redis Secret: ${REDIS_SECRET_NAME}`);
      console.log(`App Secret: ${APP_SECRET_NAME}`);
      
      // Fetch secrets from AWS Secrets Manager
      const [dbSecrets, redisSecrets, appSecrets] = await Promise.all([
        getSecret(DB_SECRET_NAME),
        getSecret(REDIS_SECRET_NAME),
        getSecret(APP_SECRET_NAME)
      ]);

      console.log('Successfully fetched all secrets from AWS Secrets Manager');
      console.log('Database config:', {
        host: (dbSecrets.host || dbSecrets.hostname).split(':')[0], // Show cleaned host
        port: dbSecrets.port,
        database: dbSecrets.database || dbSecrets.dbname
      });
      console.log('Redis config:', {
        host: (redisSecrets.host || redisSecrets.hostname).includes(':') 
          ? (redisSecrets.host || redisSecrets.hostname).split(':')[0] 
          : (redisSecrets.host || redisSecrets.hostname), // Only split if port is included
        port: redisSecrets.port,
        tls: redisSecrets.tls || redisSecrets.ssl_enabled || 'false',
        hasPassword: !!redisSecrets.password
      });

      return {
        // Database configuration - handle different possible field names and clean host
        DB_HOST: (dbSecrets.host || dbSecrets.hostname).split(':')[0], // Remove port from hostname
        DB_USER: dbSecrets.username || dbSecrets.user,
        DB_PASSWORD: dbSecrets.password,
        DB_NAME: dbSecrets.dbname || dbSecrets.database || 'ecommerce_db',
        DB_PORT: dbSecrets.port || 5432,

        // Redis configuration - handle different possible field names and clean host
        REDIS_HOST: (redisSecrets.host || redisSecrets.hostname).includes(':') 
          ? (redisSecrets.host || redisSecrets.hostname).split(':')[0] 
          : (redisSecrets.host || redisSecrets.hostname), // Only split if port is included
        REDIS_PORT: redisSecrets.port || 6379,
        REDIS_PASSWORD: redisSecrets.password || redisSecrets.auth_token,
        REDIS_TLS: redisSecrets.tls || redisSecrets.ssl_enabled || 'true', // Default to true since ElastiCache has TLS enabled
        REDIS_CLUSTER_MODE: redisSecrets.cluster_mode || 'false',

        // Application secrets - matching your AWS Secrets Manager structure
        JWT_SECRET: appSecrets.jwt_secret,
        JWT_EXPIRES_IN: appSecrets.jwt_expires_in || '7d',
        SESSION_SECRET: appSecrets.session_secret,
        SESSION_MAX_AGE: appSecrets.session_max_age || 86400000,
        API_KEY: appSecrets.api_key,
        ENCRYPTION_KEY: appSecrets.encryption_key,

        // Other configuration
        NODE_ENV: process.env.NODE_ENV || 'production',
        PORT: process.env.PORT || 3000,
        RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS || 900000,
        RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
        AWS_REGION: process.env.AWS_REGION || 'us-east-1'
      };
    } catch (error) {
      console.error('Failed to load secrets from AWS Secrets Manager:', error.message);
      console.log('Falling back to environment variables...');
      return loadFromEnvironment();
    }
  } else {
    console.log('Using environment variables for configuration');
    return loadFromEnvironment();
  }
}

function loadFromEnvironment() {
  console.log('Loading configuration from environment variables...');
  
  const config = {
    // Database configuration
    DB_HOST: process.env.DB_HOST,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_NAME: process.env.DB_NAME || 'ecommerce_db', // FIXED: Changed from user_auth_db
    DB_PORT: process.env.DB_PORT || 5432, // FIXED: Changed from 3306 to 5432 (PostgreSQL)

    // Redis configuration
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT || 6379,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    REDIS_TLS: process.env.REDIS_TLS || 'false',

    // Application secrets
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    SESSION_SECRET: process.env.SESSION_SECRET,
    SESSION_MAX_AGE: process.env.SESSION_MAX_AGE || 86400000,
    API_KEY: process.env.API_KEY,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,

    // Other configuration
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 3000,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS || 900000,
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
    AWS_REGION: process.env.AWS_REGION || 'us-east-1'
  };

  // Validate required fields
  const requiredFields = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'REDIS_HOST'];
  const missingFields = requiredFields.filter(field => !config[field]);
  
  if (missingFields.length > 0) {
    console.warn(`Warning: Missing required environment variables: ${missingFields.join(', ')}`);
  }

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

// Clear cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of secretsCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      secretsCache.delete(key);
    }
  }
}, CACHE_TTL);

module.exports = {
  initializeConfig,
  getConfig,
  getSecret,
  getSecretValue
};
