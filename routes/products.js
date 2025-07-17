const express = require('express');
const { query } = require('../config/database');
const { cache } = require('../config/redis');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Get all products (public)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const category = req.query.category;
    
    const cacheKey = `products:${page}:${limit}:${category || 'all'}`;
    
    // Check cache first
    let cachedData = await cache.get(cacheKey);
    
    if (!cachedData) {
      let whereClause = '';
      let params = [];
      
      if (category) {
        whereClause = 'WHERE category = $1';
        params.push(category);
      }
      
      const [products, totalCount] = await Promise.all([
        query(`
          SELECT id, name, description, price, category, image_url, stock_quantity, created_at
          FROM products 
          ${whereClause}
          ORDER BY created_at DESC 
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `, [...params, limit, offset]),
        query(`
          SELECT COUNT(*) as total 
          FROM products 
          ${whereClause}
        `, params)
      ]);
      
      cachedData = {
        products,
        pagination: {
          page,
          limit,
          total: totalCount[0].total,
          pages: Math.ceil(totalCount[0].total / limit)
        }
      };
      
      // Cache for 5 minutes
      await cache.set(cacheKey, cachedData, 300);
    }
    
    res.json({
      success: true,
      data: cachedData
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get product by ID
router.get('/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }
    
    // Check cache first
    let product = await cache.get(`product:${productId}`);
    
    if (!product) {
      const result = await query(
        'SELECT * FROM products WHERE id = $1',
        [productId]
      );
      
      if (result.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }
      
      product = result[0];
      // Cache for 10 minutes
      await cache.set(`product:${productId}`, product, 600);
    }
    
    res.json({
      success: true,
      data: {
        product
      }
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Create order (requires authentication)
router.post('/order', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { items } = req.body; // Array of {product_id, quantity}
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order items are required'
      });
    }
    
    // Validate products and calculate total
    let totalAmount = 0;
    const orderItems = [];
    
    for (const item of items) {
      const product = await query(
        'SELECT id, name, price, stock_quantity FROM products WHERE id = $1',
        [item.product_id]
      );
      
      if (product.length === 0) {
        return res.status(400).json({
          success: false,
          message: `Product with ID ${item.product_id} not found`
        });
      }
      
      const productData = product[0];
      
      if (productData.stock_quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for product ${productData.name}`
        });
      }
      
      const itemTotal = productData.price * item.quantity;
      totalAmount += itemTotal;
      
      orderItems.push({
        product_id: productData.id,
        quantity: item.quantity,
        unit_price: productData.price,
        total_price: itemTotal
      });
    }
    
    // Create order
    const orderResult = await query(
      'INSERT INTO orders (user_id, total_amount, status) VALUES ($1, $2, $3) RETURNING id',
      [userId, totalAmount, 'pending']
    );
    
    const orderId = orderResult[0].id;
    
    // Insert order items
    for (const item of orderItems) {
      await query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5)',
        [orderId, item.product_id, item.quantity, item.unit_price, item.total_price]
      );
      
      // Update stock
      await query(
        'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }
    
    // Clear relevant caches
    await cache.del(`dashboard:${userId}`);
    await cache.del('products:*');
    
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        order_id: orderId,
        total_amount: totalAmount
      }
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get user orders (requires authentication)
router.get('/orders/my', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    const cacheKey = `orders:user:${userId}:${page}:${limit}`;
    
    // Check cache first
    let cachedData = await cache.get(cacheKey);
    
    if (!cachedData) {
      const [orders, totalCount] = await Promise.all([
        query(`
          SELECT o.id, o.total_amount, o.status, o.created_at,
                 COUNT(oi.id) as item_count
          FROM orders o
          LEFT JOIN order_items oi ON o.id = oi.order_id
          WHERE o.user_id = $1
          GROUP BY o.id
          ORDER BY o.created_at DESC
          LIMIT $2 OFFSET $3
        `, [userId, limit, offset]),
        query(`
          SELECT COUNT(*) as total 
          FROM orders 
          WHERE user_id = $1
        `, [userId])
      ]);
      
      cachedData = {
        orders,
        pagination: {
          page,
          limit,
          total: totalCount[0].total,
          pages: Math.ceil(totalCount[0].total / limit)
        }
      };
      
      // Cache for 5 minutes
      await cache.set(cacheKey, cachedData, 300);
    }
    
    res.json({
      success: true,
      data: cachedData
    });
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
