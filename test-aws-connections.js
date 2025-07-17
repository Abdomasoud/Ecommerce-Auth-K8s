#!/usr/bin/env node

/**
 * Test AWS connections - Database, Redis, and Secrets Manager
 * This script helps verify that all AWS services are properly configured
 */

require('dotenv').config();

const { initializeConfig, getConfig } = require('./config/secrets');
const { connectDB, query } = require('./config/database');
const { redisClient } = require('./config/redis');

async function testSecretsManager() {
  console.log('\n🔐 Testing AWS Secrets Manager...');
  try {
    await initializeConfig();
    const config = getConfig();
    
    console.log('✅ Secrets Manager connection successful');
    console.log('📋 Configuration loaded:', {
      DB_HOST: config.DB_HOST,
      DB_NAME: config.DB_NAME,
      DB_PORT: config.DB_PORT,
      REDIS_HOST: config.REDIS_HOST,
      REDIS_PORT: config.REDIS_PORT,
      AWS_REGION: config.AWS_REGION,
      NODE_ENV: config.NODE_ENV
    });
    
    return config;
  } catch (error) {
    console.error('❌ Secrets Manager connection failed:', error.message);
    throw error;
  }
}

async function testDatabase() {
  console.log('\n🗄️  Testing AWS RDS PostgreSQL connection...');
  try {
    await connectDB();
    
    // Test basic query
    const result = await query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Database connection successful');
    console.log('📊 Database info:', {
      current_time: result[0].current_time,
      pg_version: result[0].pg_version.substring(0, 50) + '...'
    });

    // Test database schema
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('📋 Available tables:', tables.map(t => t.table_name));

    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    throw error;
  }
}

async function testRedis() {
  console.log('\n🔴 Testing AWS ElastiCache Redis connection...');
  try {
    await redisClient.connect();
    
    // Test basic operations
    await redisClient.set('test:connection', 'success', { EX: 60 });
    const testValue = await redisClient.get('test:connection');
    
    console.log('✅ Redis connection successful');
    console.log('📊 Redis info:', {
      test_value: testValue,
      connected: redisClient.isReady
    });

    // Test Redis info
    const info = await redisClient.info('server');
    const lines = info.split('\n');
    const serverInfo = {};
    lines.forEach(line => {
      if (line.includes(':') && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          serverInfo[key.trim()] = value.trim();
        }
      }
    });
    
    console.log('📋 Redis server info:', {
      redis_version: serverInfo.redis_version,
      os: serverInfo.os,
      arch_bits: serverInfo.arch_bits
    });

    // Clean up test key
    await redisClient.del('test:connection');
    
    return true;
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    throw error;
  }
}

async function testHealthEndpoint() {
  console.log('\n🏥 Testing application health...');
  try {
    const { cache } = require('./config/redis');
    
    // Test cache operations
    await cache.set('health:test', { status: 'ok', timestamp: Date.now() }, 30);
    const healthData = await cache.get('health:test');
    
    console.log('✅ Application health test successful');
    console.log('📊 Health data:', healthData);
    
    // Clean up
    await cache.del('health:test');
    
    return true;
  } catch (error) {
    console.error('❌ Application health test failed:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting AWS Connection Tests...');
  console.log('=====================================');
  
  try {
    // Test 1: Secrets Manager
    await testSecretsManager();
    
    // Test 2: RDS PostgreSQL
    await testDatabase();
    
    // Test 3: ElastiCache Redis
    await testRedis();
    
    // Test 4: Application health
    await testHealthEndpoint();
    
    console.log('\n🎉 All AWS connection tests passed!');
    console.log('=====================================');
    console.log('✅ Secrets Manager: Connected');
    console.log('✅ RDS PostgreSQL: Connected');
    console.log('✅ ElastiCache Redis: Connected');
    console.log('✅ Application Health: OK');
    
  } catch (error) {
    console.error('\n💥 Connection test failed:', error.message);
    process.exit(1);
  } finally {
    // Clean up connections
    try {
      if (redisClient.isReady) {
        await redisClient.quit();
      }
    } catch (error) {
      console.error('Error closing Redis connection:', error);
    }
    
    console.log('\n🔄 Connection test completed');
    process.exit(0);
  }
}

// Run the tests
main();
