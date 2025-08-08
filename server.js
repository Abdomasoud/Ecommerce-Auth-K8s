const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const { initializeConfig, getConfig } = require('./config/secrets');
const { connectDB, closePool } = require('./config/database');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const productRoutes = require('./routes/products');

const app = express();

// Global variables to track connections
let redisClient = null;
let server = null;

// Initialize configuration and start server
async function startServer() {
  try {
    console.log('Starting server initialization...');
    
    // Initialize configuration (will load from Secrets Manager or env vars)
    console.log('Step 1: Initializing configuration...');
    await initializeConfig();
    const config = getConfig();
    
    // Now that config is initialized, we can import Redis client
    console.log('Step 2: Importing Redis client...');
    const { redisClient: redis } = require('./config/redis');
    redisClient = redis; // Store globally for shutdown
    
    console.log('Configuration loaded successfully:', {
      NODE_ENV: config.NODE_ENV,
      PORT: config.PORT,
      AWS_REGION: config.AWS_REGION,
      DB_HOST: config.DB_HOST,
      DB_NAME: config.DB_NAME,
      DB_PORT: config.DB_PORT,
      REDIS_HOST: config.REDIS_HOST,
      REDIS_PORT: config.REDIS_PORT,
      useSecretsManager: process.env.USE_SECRETS_MANAGER === 'true' || config.NODE_ENV === 'production'
    });

    const PORT = config.PORT || 3000;

    // Security middleware
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
    }));
    
    app.use(cors({
      origin: config.NODE_ENV === 'production' ? ['https://yourdomain.com'] : ['http://localhost:3000'],
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(config.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(config.RATE_LIMIT_MAX_REQUESTS) || 100 // limit each IP to 100 requests per windowMs
    });
    app.use('/api/', limiter);

    // Logging
    if (config.NODE_ENV !== 'production') {
      app.use(morgan('dev'));
    }

    // Body parsing middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Static files
    app.use(express.static(path.join(__dirname, 'public')));

    // Step 3: Initialize database connection
    console.log('Step 3: Connecting to PostgreSQL...');
    await connectDB();
    
    // Step 4: Initialize Redis connection
    console.log('Step 4: Connecting to Redis...');
    try {
      await redisClient.connect();
      console.log('✅ Redis connected successfully');
    } catch (error) {
      console.warn('⚠️  Redis connection failed, continuing without Redis:', error.message);
      redisClient = null; // Set to null if connection fails
    }

    // Session configuration - only if Redis is available
    if (redisClient) {
      app.use(session({
        store: new RedisStore({ client: redisClient }),
        secret: config.SESSION_SECRET || 'fallback-session-secret',
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: config.NODE_ENV === 'production',
          httpOnly: true,
          maxAge: parseInt(config.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000 // 24 hours
        }
      }));
    } else {
      // Fallback to memory store if Redis is not available
      app.use(session({
        secret: config.SESSION_SECRET || 'fallback-session-secret',
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: config.NODE_ENV === 'production',
          httpOnly: true,
          maxAge: parseInt(config.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000 // 24 hours
        }
      }));
    }

    // Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/user', userRoutes);
    app.use('/api/products', productRoutes);

    // Serve static HTML files
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.get('/login', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'login.html'));
    });

    app.get('/signup', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'signup.html'));
    });

    app.get('/dashboard', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    });

    // Health check endpoint
    app.get('/health', async (req, res) => {
      try {
        // Check database connection
        const { query } = require('./config/database');
        await query('SELECT 1');
        
        // Check Redis connection if available
        let redisStatus = 'not connected';
        if (redisClient) {
          try {
            await redisClient.ping();
            redisStatus = 'connected';
          } catch (error) {
            redisStatus = 'error';
          }
        }
        
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            database: 'connected',
            redis: redisStatus
          }
        });
      } catch (error) {
        res.status(500).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    });

    // Simple deployment test endpoint
    app.get('/deployment', (req, res) => {
      res.json({
        message: 'deployment success'
      });
    });

    // Error handling middleware
    app.use((err, req, res, next) => {
      console.error('Application error:', err.stack);
      res.status(500).json({
        success: false,
        message: config.NODE_ENV === 'production' ? 'Something went wrong!' : err.message
      });
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    });
    
    // START THE SERVER - This was missing proper error handling
    console.log('Step 5: Starting HTTP server...');
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${config.NODE_ENV}`);
      console.log(`🔐 Using Secrets Manager: ${process.env.USE_SECRETS_MANAGER === 'true' || config.NODE_ENV === 'production'}`);
      console.log(`🗄️  Database: ${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`);
      console.log(`🔴 Redis: ${config.REDIS_HOST}:${config.REDIS_PORT} (${redisClient ? 'connected' : 'not connected'})`);
      console.log(`🚀 Server initialization completed successfully!`);
      console.log(`🌐 Server listening on http://0.0.0.0:${PORT}`);
    });

    // Handle server startup errors
    server.on('error', (error) => {
      console.error('❌ Server startup error:', error);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
}

// Graceful shutdown function
async function gracefulShutdown(signal) {
  console.log(`${signal} received, shutting down gracefully`);
  
  try {
    // Close HTTP server
    if (server) {
      console.log('Closing HTTP server...');
      server.close(() => {
        console.log('HTTP server closed');
      });
    }

    // Close Redis connection
    if (redisClient) {
      console.log('Closing Redis connection...');
      await redisClient.quit();
      console.log('Redis connection closed');
    }

    // Close database pool
    console.log('Closing database pool...');
    await closePool();
    console.log('Database pool closed');

    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Graceful shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;