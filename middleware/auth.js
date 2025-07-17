const jwt = require('jsonwebtoken');
const { cache } = require('../config/redis');
const { query } = require('../config/database');
const { getConfig } = require('../config/secrets');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.session.token;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided, authorization denied'
      });
    }

    // Check if token is blacklisted
    const isBlacklisted = await cache.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Token has been invalidated'
      });
    }

    // Verify token
    const config = getConfig();
    const decoded = jwt.verify(token, config.JWT_SECRET);
    
    // Check cache for user data first
    let user = await cache.get(`user:${decoded.userId}`);
    
    if (!user) {
      // If not in cache, fetch from database
      const result = await query(
        'SELECT id, username, email, created_at, updated_at FROM users WHERE id = $1',
        [decoded.userId]
      );
      
      if (result.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }
      
      user = result[0];
      // Cache user data for 1 hour
      await cache.set(`user:${decoded.userId}`, user, 3600);
    }
    
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({
      success: false,
      message: 'Token is not valid'
    });
  }
};

module.exports = authMiddleware;
