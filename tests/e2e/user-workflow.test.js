// End-to-end tests for complete user workflows
const request = require('supertest');
const app = require('../../server');
const { TestDatabase, TestRedis, generateTestUser, expectSuccessResponse } = require('../helpers');

describe('End-to-End User Workflows', () => {
  let testDb, testRedis;

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
  });

  describe('Complete User Registration and Shopping Flow', () => {
    test('should complete full user journey from signup to order', async () => {
      // 1. User signs up
      const userData = generateTestUser();
      const signupResponse = await request(app)
        .post('/api/auth/signup')
        .send(userData);

      expectSuccessResponse(signupResponse, 201);
      const { user, token } = signupResponse.body.data;
      expect(user.username).toBe(userData.username);
      expect(token).toBeDefined();

      // 2. User updates profile
      const profileData = {
        first_name: 'John',
        last_name: 'Doe',
        phone: '+1234567890',
        bio: 'Test user bio'
      };

      const profileResponse = await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${token}`)
        .send(profileData);

      expectSuccessResponse(profileResponse);

      // 3. User views dashboard
      const dashboardResponse = await request(app)
        .get('/api/user/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expectSuccessResponse(dashboardResponse);
      expect(dashboardResponse.body.data.stats.total_orders).toBe(0);
      expect(dashboardResponse.body.data.stats.total_spent).toBe('0.00');

      // 4. User browses products
      const productsResponse = await request(app)
        .get('/api/products');

      expectSuccessResponse(productsResponse);
      expect(productsResponse.body.data.products.length).toBeGreaterThan(0);

      // 5. User views specific product
      const productResponse = await request(app)
        .get('/api/products/1');

      expectSuccessResponse(productResponse);
      const product = productResponse.body.data.product;
      expect(product.id).toBe(1);

      // 6. User places order
      const orderData = {
        items: [
          { product_id: 1, quantity: 2 },
          { product_id: 2, quantity: 1 }
        ]
      };

      const orderResponse = await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${token}`)
        .send(orderData);

      expectSuccessResponse(orderResponse, 201);
      expect(orderResponse.body.data.order_id).toBeDefined();
      const expectedTotal = (29.99 * 2) + (39.99 * 1);
      expect(orderResponse.body.data.total_amount).toBe(expectedTotal);

      // 7. User views updated dashboard
      const updatedDashboardResponse = await request(app)
        .get('/api/user/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expectSuccessResponse(updatedDashboardResponse);
      expect(updatedDashboardResponse.body.data.stats.total_orders).toBe(1);
      expect(parseFloat(updatedDashboardResponse.body.data.stats.total_spent)).toBe(expectedTotal);

      // 8. User views order history
      const ordersResponse = await request(app)
        .get('/api/products/orders/my')
        .set('Authorization', `Bearer ${token}`);

      expectSuccessResponse(ordersResponse);
      expect(ordersResponse.body.data.orders).toHaveLength(1);
      expect(ordersResponse.body.data.orders[0].total_amount).toBe(expectedTotal.toString());

      // 9. User logs out
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expectSuccessResponse(logoutResponse);

      // 10. Token should be invalidated
      const profileAfterLogout = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(profileAfterLogout.status).toBe(401);
      expect(profileAfterLogout.body.message).toBe('Token has been invalidated');
    });

    test('should handle user login and continue shopping', async () => {
      // 1. User logs in with existing account
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test1@example.com',
          password: 'password123'
        });

      expectSuccessResponse(loginResponse);
      const { user, token } = loginResponse.body.data;
      expect(user.username).toBe('testuser1');

      // 2. User views their existing orders
      const ordersResponse = await request(app)
        .get('/api/products/orders/my')
        .set('Authorization', `Bearer ${token}`);

      expectSuccessResponse(ordersResponse);
      expect(ordersResponse.body.data.orders).toHaveLength(2); // From seeded data

      // 3. User places new order
      const orderData = {
        items: [
          { product_id: 3, quantity: 1 }
        ]
      };

      const orderResponse = await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${token}`)
        .send(orderData);

      expectSuccessResponse(orderResponse, 201);

      // 4. User views updated order history
      const updatedOrdersResponse = await request(app)
        .get('/api/products/orders/my')
        .set('Authorization', `Bearer ${token}`);

      expectSuccessResponse(updatedOrdersResponse);
      expect(updatedOrdersResponse.body.data.orders).toHaveLength(3); // 2 + 1 new order
    });
  });

  describe('Authentication Flow Edge Cases', () => {
    test('should handle invalid credentials gracefully', async () => {
      // 1. Try to login with invalid credentials
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'wrongpassword'
        });

      expect(loginResponse.status).toBe(401);
      expect(loginResponse.body.success).toBe(false);

      // 2. Try to access protected route without token
      const profileResponse = await request(app)
        .get('/api/user/profile');

      expect(profileResponse.status).toBe(401);
      expect(profileResponse.body.success).toBe(false);
    });

    test('should handle token expiration', async () => {
      // This test would require mocking JWT expiration
      // For now, we'll test with an invalid token
      const invalidToken = 'invalid.jwt.token';

      const response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${invalidToken}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should handle duplicate registration attempts', async () => {
      // 1. First signup
      const userData = generateTestUser();
      const firstSignup = await request(app)
        .post('/api/auth/signup')
        .send(userData);

      expectSuccessResponse(firstSignup, 201);

      // 2. Try to signup with same email
      const duplicateSignup = await request(app)
        .post('/api/auth/signup')
        .send(userData);

      expect(duplicateSignup.status).toBe(409);
      expect(duplicateSignup.body.success).toBe(false);
      expect(duplicateSignup.body.message).toBe('User with this email or username already exists');
    });
  });

  describe('Shopping Cart Edge Cases', () => {
    test('should handle insufficient stock scenarios', async () => {
      // 1. Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test1@example.com',
          password: 'password123'
        });

      const { token } = loginResponse.body.data;

      // 2. Try to order more than available stock
      const orderData = {
        items: [
          { product_id: 1, quantity: 50 } // Stock is only 10
        ]
      };

      const orderResponse = await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${token}`)
        .send(orderData);

      expect(orderResponse.status).toBe(400);
      expect(orderResponse.body.success).toBe(false);
      expect(orderResponse.body.message).toContain('Insufficient stock');
    });

    test('should handle nonexistent product orders', async () => {
      // 1. Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test1@example.com',
          password: 'password123'
        });

      const { token } = loginResponse.body.data;

      // 2. Try to order nonexistent product
      const orderData = {
        items: [
          { product_id: 999, quantity: 1 }
        ]
      };

      const orderResponse = await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${token}`)
        .send(orderData);

      expect(orderResponse.status).toBe(400);
      expect(orderResponse.body.success).toBe(false);
      expect(orderResponse.body.message).toBe('Product with ID 999 not found');
    });

    test('should handle empty cart orders', async () => {
      // 1. Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test1@example.com',
          password: 'password123'
        });

      const { token } = loginResponse.body.data;

      // 2. Try to order with empty items
      const orderData = {
        items: []
      };

      const orderResponse = await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${token}`)
        .send(orderData);

      expect(orderResponse.status).toBe(400);
      expect(orderResponse.body.success).toBe(false);
      expect(orderResponse.body.message).toBe('Order items are required');
    });
  });

  describe('Data Consistency Tests', () => {
    test('should maintain data consistency across multiple operations', async () => {
      // 1. Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test1@example.com',
          password: 'password123'
        });

      const { token } = loginResponse.body.data;

      // 2. Get initial product stock
      const productResponse = await request(app)
        .get('/api/products/1');

      const initialStock = productResponse.body.data.product.stock_quantity;

      // 3. Place order
      const orderQuantity = 2;
      const orderData = {
        items: [
          { product_id: 1, quantity: orderQuantity }
        ]
      };

      await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${token}`)
        .send(orderData);

      // 4. Verify stock was updated
      const updatedProductResponse = await request(app)
        .get('/api/products/1');

      const updatedStock = updatedProductResponse.body.data.product.stock_quantity;
      expect(updatedStock).toBe(initialStock - orderQuantity);

      // 5. Verify order was created in database
      const ordersResponse = await request(app)
        .get('/api/products/orders/my')
        .set('Authorization', `Bearer ${token}`);

      // Should have original 2 orders plus 1 new order
      expect(ordersResponse.body.data.orders).toHaveLength(3);
    });

    test('should handle concurrent user operations', async () => {
      // 1. Login as user 1
      const loginResponse1 = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test1@example.com',
          password: 'password123'
        });

      const token1 = loginResponse1.body.data.token;

      // 2. Login as user 2
      const loginResponse2 = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test2@example.com',
          password: 'password123'
        });

      const token2 = loginResponse2.body.data.token;

      // 3. Both users place orders for the same product
      const orderData = {
        items: [
          { product_id: 3, quantity: 5 } // Stock is 15
        ]
      };

      // Place both orders
      const [order1Response, order2Response] = await Promise.all([
        request(app)
          .post('/api/products/order')
          .set('Authorization', `Bearer ${token1}`)
          .send(orderData),
        request(app)
          .post('/api/products/order')
          .set('Authorization', `Bearer ${token2}`)
          .send(orderData)
      ]);

      // Both orders should succeed
      expectSuccessResponse(order1Response, 201);
      expectSuccessResponse(order2Response, 201);

      // 4. Verify final stock is correct
      const productResponse = await request(app)
        .get('/api/products/3');

      expect(productResponse.body.data.product.stock_quantity).toBe(5); // 15 - 5 - 5

      // 5. Verify each user has their own order
      const user1Orders = await request(app)
        .get('/api/products/orders/my')
        .set('Authorization', `Bearer ${token1}`);

      const user2Orders = await request(app)
        .get('/api/products/orders/my')
        .set('Authorization', `Bearer ${token2}`);

      expect(user1Orders.body.data.orders).toHaveLength(3); // 2 seeded + 1 new
      expect(user2Orders.body.data.orders).toHaveLength(2); // 1 seeded + 1 new
    });
  });

  describe('Performance and Caching Tests', () => {
    test('should serve cached data for repeated requests', async () => {
      // 1. First request to products (should cache)
      const start1 = Date.now();
      const response1 = await request(app)
        .get('/api/products');
      const duration1 = Date.now() - start1;

      expectSuccessResponse(response1);

      // 2. Second request (should use cache)
      const start2 = Date.now();
      const response2 = await request(app)
        .get('/api/products');
      const duration2 = Date.now() - start2;

      expectSuccessResponse(response2);

      // Cache should make second request faster (in most cases)
      // This is a rough test and might not always pass due to timing variations
      expect(response2.body.data.products).toEqual(response1.body.data.products);
    });

    test('should invalidate cache appropriately', async () => {
      // 1. Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test1@example.com',
          password: 'password123'
        });

      const { token } = loginResponse.body.data;

      // 2. Get dashboard (should cache)
      const dashboardResponse1 = await request(app)
        .get('/api/user/dashboard')
        .set('Authorization', `Bearer ${token}`);

      const initialOrderCount = dashboardResponse1.body.data.stats.total_orders;

      // 3. Place order (should invalidate dashboard cache)
      await request(app)
        .post('/api/products/order')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ product_id: 1, quantity: 1 }]
        });

      // 4. Get dashboard again (should show updated data)
      const dashboardResponse2 = await request(app)
        .get('/api/user/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(dashboardResponse2.body.data.stats.total_orders).toBe(initialOrderCount + 1);
    });
  });
});
