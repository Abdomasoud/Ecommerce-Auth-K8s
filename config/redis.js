const { createClient } = require('redis');
const { getConfig } = require('./secrets');

let redisClient = null;

function createRedisClient() {
  if (!redisClient) {
    const config = getConfig();
    
    console.log('Redis config:', config.REDIS_HOST, config.REDIS_PORT, !!config.REDIS_PASSWORD);

    const redisConfig = {
      socket: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT || 6379,
        connectTimeout: 10000,
        reconnectStrategy: (retries) => retries > 3 ? false : retries * 100
      },
      username: 'default',
      ...(config.REDIS_PASSWORD && { password: config.REDIS_PASSWORD }),
      database: 0,
      lazyConnect: false
    };
    
    redisClient = createClient(redisConfig);

    redisClient.on('error', (err) => {
      console.error('Redis Error:', err.code || err.message);
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis Ready');
    });
  }
  return redisClient;
}

async function initializeRedisConnection() {
  try {
    const client = createRedisClient();
    
    if (!client.isOpen) {
      await client.connect();
    }
    
    await client.ping();
    console.log('✅ Redis connected and tested');
    return client;
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    throw error;
  }
}

const cache = {
  async get(key) {
    try {
      const client = createRedisClient();
      if (!client.isOpen) await client.connect();
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
      if (!client.isOpen) await client.connect();
      await client.set(key, JSON.stringify(value), { EX: expiration });
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  }
};

module.exports = {
  get redisClient() {
    return createRedisClient();
  },
  initializeRedisConnection,
  cache
};