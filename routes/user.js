const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { cache } = require('../config/redis');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Get user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check cache first
    let userProfile = await cache.get(`profile:${userId}`);
    
    if (!userProfile) {
      // Fetch from database
      const result = await query(`
        SELECT u.id, u.username, u.email, u.created_at, u.updated_at, u.last_login,
               p.first_name, p.last_name, p.phone, p.bio, p.avatar_url
        FROM users u
        LEFT JOIN user_profiles p ON u.id = p.user_id
        WHERE u.id = $1
      `, [userId]);
      
      if (result.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      userProfile = result[0];
      // Cache for 30 minutes
      await cache.set(`profile:${userId}`, userProfile, 1800);
    }
    
    res.json({
      success: true,
      data: {
        profile: userProfile
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update user profile
router.put('/profile', authMiddleware, [
  body('first_name').optional().trim().isLength({ max: 50 }),
  body('last_name').optional().trim().isLength({ max: 50 }),
  body('phone').optional().trim().matches(/^[\+]?[1-9][\d]{0,15}$/),
  body('bio').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { first_name, last_name, phone, bio } = req.body;

    // Check if profile exists
    const existingProfile = await query(
      'SELECT user_id FROM user_profiles WHERE user_id = $1',
      [userId]
    );

    if (existingProfile.length === 0) {
      // Create new profile
      await query(`
        INSERT INTO user_profiles (user_id, first_name, last_name, phone, bio)
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, first_name || null, last_name || null, phone || null, bio || null]);
    } else {
      // Update existing profile
      await query(`
        UPDATE user_profiles 
        SET first_name = $1, last_name = $2, phone = $3, bio = $4, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $5
      `, [first_name || null, last_name || null, phone || null, bio || null, userId]);
    }

    // Clear cache
    await cache.del(`profile:${userId}`);

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get user dashboard data
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check cache first
    let dashboardData = await cache.get(`dashboard:${userId}`);
    
    if (!dashboardData) {
      // Fetch dashboard data from database
      const [userStats, recentOrders] = await Promise.all([
        query(`
          SELECT 
            COUNT(DISTINCT o.id) as total_orders,
            COALESCE(SUM(o.total_amount), 0) as total_spent
          FROM orders o
          WHERE o.user_id = $1
        `, [userId]),
        query(`
          SELECT o.id, o.total_amount, o.status, o.created_at,
                 COUNT(oi.id) as item_count
          FROM orders o
          LEFT JOIN order_items oi ON o.id = oi.order_id
          WHERE o.user_id = $1
          GROUP BY o.id
          ORDER BY o.created_at DESC
          LIMIT 5
        `, [userId])
      ]);
      
      dashboardData = {
        stats: userStats[0] || { total_orders: 0, total_spent: 0 },
        recent_orders: recentOrders
      };
      
      // Cache for 10 minutes
      await cache.set(`dashboard:${userId}`, dashboardData, 600);
    }
    
    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
