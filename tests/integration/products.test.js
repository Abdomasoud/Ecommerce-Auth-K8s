// Integration tests for products routes
const request = require('supertest');
const app = require('../../server');
const { TestDatabase, TestRedis, generateJWT, expectSuccessResponse } = require('../helpers');

describe('Products Routes Integration', () => {
  let testDb, testRedis, authToken;

  beforeAll(async () => {
    testDb = new TestDatabase();
    testRedis = new TestRedis();
    
    await testDb.connect();
    await testRedis.connect();
  });

  afterAll(async () => {
    await testDb.disconnect();
    await testRedis.disconnect();
  });

  beforeEach(async () => {
    await testDb.clearDatabase();
    await testRedis.flushAll();
    await testDb.seedDatabase();
    
    // Generate auth token for user ID 1
    authToken = generateJWT(1);
  });

  describe('GET /api/products', () => {
    test('should return paginated products list', async () => {
      const response = await request(app)
        .get('/api/products');

      expectSuccessResponse(response);
      expect(response.body.data.products).toBeDefined();
      expect(response.body.data.products).toHaveLength(5);
      expect(response.body.data.pagination).toBeDefined();
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(10);
      expect(response.body.data.pagination.total).toBe(5);
    });

    test('should support pagination parameters', async () => {
      const response = await request(app)
        .get('/api/products?page=1&limit=2');

      expectSuccessResponse(response);
      expect(response.body.data.products).toHaveLength(2);
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(2);
      expect(response.body.data.pagination.pages).toBe(3);
    });

    test('should filter products by category', async () => {
      const response = await request(app)
        .get('/api/products?category=Electronics');

      expectSuccessResponse(response);
      expect(response.body.data.products).toHaveLength(2);
      response.body.data.products.forEach(product => {
        expect(product.category).toBe('Electronics');
      });
    });

    test('should return products with correct structure', async () => {
      const response = await request(app)
        .get('/api/products');

      expectSuccessResponse(response);
      const product = response.body.data.products[0];
      expect(product.id).toBeDefined();
      expect(product.name).toBeDefined();
      expect(product.description).toBeDefined();
      expect(product.price).toBeDefined();
      expect(product.category).toBeDefined();
      expect(product.stock_quantity).toBeDefined();
      expect(product.created_at).toBeDefined();
    });

    test('should cache products data', async () => {
      // First request
      await request(app)
        .get('/api/products?page=1&limit=10');

      // Check if data is cached
      const cachedProducts = await testRedis.get('products:1:10:all');
      expect(cachedProducts).toBeDefined();
      expect(cachedProducts.products).toBeDefined();
      expect(cachedProducts.pagination).toBeDefined();
    });

    test('should work without authentication', async () => {
      const response = await request(app)
        .get('/api/products');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/products/:id', () => {
    test('should return specific product by ID', async () => {
      const response = await request(app)
        .get('/api/products/1');

      expectSuccessResponse(response);
      expect(response.body.data.product.id).toBe(1);
      expect(response.body.data.product.name).toBe('Test Product 1');
      expect(response.body.data.product.price).toBe('29.99');
    });

    test('should return 404 for non-existent product', async () => {
      const response = await request(app)
        .get('/api/products/999');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Product not found');
    });

    test('should validate product ID format', async () => {
      const response = await request(app)
        .get('/api/products/invalid-id');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid product ID');
    });

    test('should cache individual product data', async () => {
      // First request
      await request(app)
        .get('/api/products/1');

      // Check if data is cached
      const cachedProduct = await testRedis.get('product:1');
      expect(cachedProduct).toBeDefined();
      expect(cachedProduct.id).toBe(1);
      expect(cachedProduct.name).toBe('Test Product 1');
    });

    test('should work without authentication', async () => {
      const response = await request(app)
        .get('/api/products/1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/products/order', () => {
    test('should create order successfully', async () => {
      const orderData = {
        items: [
          { product_id: 1, quantity: 2 },
          { product_id: 2, quantity: 1 }
        ]
      };

      const response = await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData);

      expectSuccessResponse(response, 201);
      expect(response.body.message).toBe('Order created successfully');
      expect(response.body.data.order_id).toBeDefined();
      expect(response.body.data.total_amount).toBe(99.97); // (29.99 * 2) + (39.99 * 1)
    });

    test('should validate order items', async () => {
      const orderData = {
        items: []
      };

      const response = await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Order items are required');
    });

    test('should validate product existence', async () => {
      const orderData = {
        items: [
          { product_id: 999, quantity: 1 }
        ]
      };

      const response = await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Product with ID 999 not found');
    });

    test('should validate stock availability', async () => {
      const orderData = {
        items: [
          { product_id: 1, quantity: 20 } // Exceeds stock of 10
        ]
      };

      const response = await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Insufficient stock');
    });

    test('should update stock after order', async () => {
      const orderData = {
        items: [
          { product_id: 1, quantity: 2 }
        ]
      };

      await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData);

      // Check stock was updated
      const product = await testDb.query('SELECT stock_quantity FROM products WHERE id = ?', [1]);
      expect(product[0].stock_quantity).toBe(8); // 10 - 2
    });

    test('should create order items records', async () => {
      const orderData = {
        items: [
          { product_id: 1, quantity: 2 },
          { product_id: 2, quantity: 1 }
        ]
      };

      const response = await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData);

      const orderId = response.body.data.order_id;
      const orderItems = await testDb.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
      
      expect(orderItems).toHaveLength(2);
      expect(orderItems[0].quantity).toBe(2);
      expect(orderItems[1].quantity).toBe(1);
    });

    test('should require authentication', async () => {
      const orderData = {
        items: [
          { product_id: 1, quantity: 1 }
        ]
      };

      const response = await request(app)
        .post('/api/products/order')
        .send(orderData);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should clear relevant caches after order', async () => {
      // First cache dashboard data
      await request(app)
        .get('/api/user/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      // Place order
      await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [{ product_id: 1, quantity: 1 }]
        });

      // Check if dashboard cache was cleared
      const cachedDashboard = await testRedis.get('dashboard:1');
      expect(cachedDashboard).toBeNull();
    });
  });

  describe('GET /api/products/orders/my', () => {
    test('should return user orders', async () => {
      const response = await request(app)
        .get('/api/products/orders/my')
        .set('Authorization', `Bearer ${authToken}`);

      expectSuccessResponse(response);
      expect(response.body.data.orders).toBeDefined();
      expect(response.body.data.orders).toHaveLength(2);
      expect(response.body.data.pagination).toBeDefined();
    });

    test('should return orders sorted by date', async () => {
      const response = await request(app)
        .get('/api/products/orders/my')
        .set('Authorization', `Bearer ${authToken}`);

      expectSuccessResponse(response);
      const orders = response.body.data.orders;
      
      // Should be sorted by created_at DESC
      expect(new Date(orders[0].created_at)).toBeInstanceOf(Date);
      expect(new Date(orders[1].created_at)).toBeInstanceOf(Date);
    });

    test('should include order item count', async () => {
      const response = await request(app)
        .get('/api/products/orders/my')
        .set('Authorization', `Bearer ${authToken}`);

      expectSuccessResponse(response);
      const orders = response.body.data.orders;
      
      orders.forEach(order => {
        expect(order.item_count).toBeDefined();
        expect(typeof order.item_count).toBe('number');
      });
    });

    test('should support pagination', async () => {
      const response = await request(app)
        .get('/api/products/orders/my?page=1&limit=1')
        .set('Authorization', `Bearer ${authToken}`);

      expectSuccessResponse(response);
      expect(response.body.data.orders).toHaveLength(1);
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(1);
    });

    test('should return empty array for user with no orders', async () => {
      const token = generateJWT(3); // User with no orders
      
      const response = await request(app)
        .get('/api/products/orders/my')
        .set('Authorization', `Bearer ${token}`);

      expectSuccessResponse(response);
      expect(response.body.data.orders).toHaveLength(0);
      expect(response.body.data.pagination.total).toBe(0);
    });

    test('should cache user orders', async () => {
      // First request
      await request(app)
        .get('/api/products/orders/my?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`);

      // Check if data is cached
      const cachedOrders = await testRedis.get('orders:user:1:1:10');
      expect(cachedOrders).toBeDefined();
      expect(cachedOrders.orders).toBeDefined();
      expect(cachedOrders.pagination).toBeDefined();
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/products/orders/my');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Product Ordering Edge Cases', () => {
    test('should handle multiple orders affecting stock', async () => {
      const orderData = {
        items: [
          { product_id: 2, quantity: 3 } // Stock is 5
        ]
      };

      // First order
      await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData);

      // Second order should succeed
      const response = await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [{ product_id: 2, quantity: 2 }]
        });

      expectSuccessResponse(response, 201);

      // Check final stock
      const product = await testDb.query('SELECT stock_quantity FROM products WHERE id = ?', [2]);
      expect(product[0].stock_quantity).toBe(0); // 5 - 3 - 2
    });

    test('should handle concurrent orders gracefully', async () => {
      const orderData = {
        items: [
          { product_id: 3, quantity: 15 } // Stock is 15
        ]
      };

      // This should succeed
      const response = await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData);

      expectSuccessResponse(response, 201);

      // Second order should fail due to insufficient stock
      const response2 = await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [{ product_id: 3, quantity: 1 }]
        });

      expect(response2.status).toBe(400);
      expect(response2.body.message).toContain('Insufficient stock');
    });
  });
});
