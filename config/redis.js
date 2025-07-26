const { createClient } = require('redis');
const { getConfig } = require('./secrets');

let redisClient = null;

function createRedisClient() {
  if (!redisClient) {
    const config = getConfig();
    
    console.log('Creating Redis client with config:', {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      hasPassword: !!config.REDIS_PASSWORD,
      tls: config.REDIS_TLS === 'true'
    });

    console.log('Redis OSS connection details:', {
      connectionString: `redis${config.REDIS_TLS === 'true' ? 's' : ''}://${config.REDIS_HOST}:${config.REDIS_PORT}`,
      tlsEnabled: config.REDIS_TLS === 'true',
      authEnabled: !!config.REDIS_PASSWORD,
      engineType: 'Redis OSS (Open Source Software)'
    });

    // AWS ElastiCache Redis OSS configuration
    const redisConfig = {
      socket: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT || 6379,
        // ElastiCache Redis OSS specific settings
        keepAlive: true,
        connectTimeout: 3000, // 3 second connection timeout for faster failure
        reconnectStrategy: (retries) => {
          if (retries >= 3) {
            console.error('Redis OSS connection failed after 3 retries');
            return new Error('Redis OSS connection failed');
          }
          return Math.min(retries * 50, 500);
        },
        // TLS configuration for ElastiCache Redis OSS with transit encryption
        ...(config.REDIS_TLS === 'true' && { 
          tls: {
            servername: config.REDIS_HOST,
            rejectUnauthorized: false, // AWS ElastiCache uses AWS-managed certificates
            checkServerIdentity: () => undefined, // Skip hostname verification for ElastiCache
            minVersion: 'TLSv1.2', // Minimum TLS version for ElastiCache Redis OSS
            maxVersion: 'TLSv1.3'  // Maximum TLS version
          }
        })
      },
      // AUTH token for ElastiCache Redis OSS (when auth is enabled)
      ...(config.REDIS_PASSWORD && { password: config.REDIS_PASSWORD }),
      
      // Redis OSS specific optimizations
      commandTimeout: 2000, // 2 second command timeout for faster retrieval
      lazyConnect: true,
      database: 0, // ElastiCache Redis OSS uses database 0 (standard Redis behavior)
      
      // Retry configuration
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`Redis retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      }
    };

    redisClient = createClient(redisConfig);

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
      if (err.code === 'ECONNREFUSED') {
        console.error('Redis connection refused. Check if Redis server is running and accessible.');
      } else if (err.code === 'ENOTFOUND') {
        console.error('Redis hostname not found. Check the REDIS_HOST configuration.');
      } else if (err.message.includes('TLS') || err.message.includes('SSL')) {
        console.error('Redis TLS/SSL error. Check if TLS is properly configured on ElastiCache.');
      } else if (err.message.includes('timeout')) {
        console.error('Redis connection timeout. Check network connectivity and security groups.');
      }
    });

    redisClient.on('connect', () => {
      console.log('Redis Client Connected to ElastiCache');
    });

    redisClient.on('ready', () => {
      console.log('Redis Client Ready - ElastiCache connection established');
    });

    redisClient.on('end', () => {
      console.log('Redis Client Disconnected from ElastiCache');
    });

    redisClient.on('reconnecting', () => {
      console.log('Redis Client Reconnecting to ElastiCache...');
    });
  }
  return redisClient;
}

// Cache helper functions
const cache = {
  async get(key) {
    try {
      const client = createRedisClient();
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  },

  async set(key, value, expiration = 3600) {
    try {
      const client = createRedisClient();
      await client.setEx(key, expiration, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  },

  async del(key) {
    try {
      const client = createRedisClient();
      await client.del(key);
      return true;
    } catch (error) {
      console.error('Redis DEL error:', error);
      return false;
    }
  },

  async exists(key) {
    try {
      const client = createRedisClient();
      return await client.exists(key);
    } catch (error) {
      console.error('Redis EXISTS error:', error);
      return false;
    }
  }
};

module.exports = {
  get redisClient() {
    return createRedisClient();
  },
  cache
};
