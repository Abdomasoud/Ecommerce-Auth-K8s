const { Pool } = require('pg');
const { getConfig } = require('./secrets');

let pool = null;

function createPool() {
  if (!pool) {
    const config = getConfig();
    
    console.log('Creating PostgreSQL pool with config:', {
      host: config.DB_HOST,
      user: config.DB_USER,
      database: config.DB_NAME,
      port: config.DB_PORT,
      ssl: process.env.NODE_ENV === 'production'
    });

    const dbConfig = {
      host: config.DB_HOST,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
      port: config.DB_PORT || 5432,
      
      // Connection pool settings for AWS RDS
      max: 20, // Maximum number of connections
      min: 5,  // Minimum number of connections
      idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
      connectionTimeoutMillis: 10000, // Wait 10 seconds for connection
      acquireTimeoutMillis: 60000, // Wait 60 seconds to acquire connection from pool
      
      // AWS RDS specific settings
      ssl: process.env.NODE_ENV === 'production' ? { 
        rejectUnauthorized: false,
        // Enable SSL for RDS
        require: true
      } : false,
      
      // Additional RDS optimizations
      statement_timeout: 30000, // 30 second statement timeout
      query_timeout: 30000,     // 30 second query timeout
      
      // Handle connection errors gracefully
      keepAlive: true,
      keepAliveInitialDelayMillis: 0,
      
      // Application name for monitoring
      application_name: 'ecommerce-app'
    };
    
    pool = new Pool(dbConfig);
    
    // Enhanced error handling for AWS RDS
    pool.on('error', (err, client) => {
      console.error('PostgreSQL pool error:', err);
      console.error('Client info:', client ? 'Client exists' : 'No client');
    });

    pool.on('connect', (client) => {
      console.log('New PostgreSQL client connected to AWS RDS');
    });

    pool.on('acquire', (client) => {
      console.log('PostgreSQL client acquired from pool');
    });

    pool.on('remove', (client) => {
      console.log('PostgreSQL client removed from pool');
    });
  }
  return pool;
}

async function connectDB() {
  try {
    const dbPool = createPool();
    const client = await dbPool.connect();
    
    // Test the connection with a simple query
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('PostgreSQL Database connected successfully to AWS RDS');
    console.log('Database time:', result.rows[0].current_time);
    console.log('PostgreSQL version:', result.rows[0].pg_version);
    
    // Test if our database exists and is accessible
    const dbCheck = await client.query('SELECT current_database() as db_name');
    console.log('Connected to database:', dbCheck.rows[0].db_name);
    
    client.release();
    return dbPool;
  } catch (error) {
    console.error('Database connection failed:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      detail: error.detail,
      hint: error.hint,
      position: error.position,
      routine: error.routine
    });
    throw error;
  }
}

async function query(sql, params = []) {
  try {
    const dbPool = createPool();
    const result = await dbPool.query(sql, params);
    return result.rows;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

module.exports = {
  connectDB,
  query,
  get pool() {
    return createPool();
  }
};
