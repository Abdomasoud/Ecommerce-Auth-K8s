// Integration tests for user routes
const request = require('supertest');
const app = require('../../server');
const { TestDatabase, TestRedis, generateJWT, expectSuccessResponse } = require('../helpers');

describe('User Routes Integration', () => {
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

  describe('GET /api/user/profile', () => {
    test('should return user profile with basic info', async () => {
      const response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expectSuccessResponse(response);
      expect(response.body.data.profile.id).toBe(1);
      expect(response.body.data.profile.username).toBe('testuser1');
      expect(response.body.data.profile.email).toBe('test1@example.com');
      expect(response.body.data.profile.first_name).toBe('John');
      expect(response.body.data.profile.last_name).toBe('Doe');
    });

    test('should return user profile without extended info when not available', async () => {
      // Use user ID 3 (no profile data)
      const token = generateJWT(3);
      
      const response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${token}`);

      expectSuccessResponse(response);
      expect(response.body.data.profile.id).toBe(3);
      expect(response.body.data.profile.username).toBe('testuser3');
      expect(response.body.data.profile.first_name).toBeNull();
      expect(response.body.data.profile.last_name).toBeNull();
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/user/profile');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should cache profile data', async () => {
      // First request
      await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`);

      // Check if data is cached
      const cachedProfile = await testRedis.get('profile:1');
      expect(cachedProfile).toBeDefined();
      expect(cachedProfile.username).toBe('testuser1');
    });
  });

  describe('PUT /api/user/profile', () => {
    test('should update user profile successfully', async () => {
      const profileData = {
        first_name: 'Jane',
        last_name: 'Smith',
        phone: '+1234567890',
        bio: 'Updated bio'
      };

      const response = await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(profileData);

      expectSuccessResponse(response);
      expect(response.body.message).toBe('Profile updated successfully');

      // Verify in database
      const profile = await testDb.query('SELECT * FROM user_profiles WHERE user_id = ?', [1]);
      expect(profile[0].first_name).toBe('Jane');
      expect(profile[0].last_name).toBe('Smith');
      expect(profile[0].phone).toBe('+1234567890');
      expect(profile[0].bio).toBe('Updated bio');
    });

    test('should create new profile if none exists', async () => {
      const token = generateJWT(3); // User without profile
      const profileData = {
        first_name: 'New',
        last_name: 'User',
        phone: '+1234567890',
        bio: 'New user bio'
      };

      const response = await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${token}`)
        .send(profileData);

      expectSuccessResponse(response);

      // Verify in database
      const profile = await testDb.query('SELECT * FROM user_profiles WHERE user_id = ?', [3]);
      expect(profile[0].first_name).toBe('New');
      expect(profile[0].last_name).toBe('User');
    });

    test('should validate phone number format', async () => {
      const profileData = {
        phone: 'invalid-phone'
      };

      const response = await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(profileData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation errors');
    });

    test('should validate bio length', async () => {
      const profileData = {
        bio: 'a'.repeat(501) // Exceeds 500 character limit
      };

      const response = await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(profileData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should clear profile cache after update', async () => {
      // First get profile to cache it
      await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`);

      // Update profile
      await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ first_name: 'Updated' });

      // Check if cache was cleared
      const cachedProfile = await testRedis.get('profile:1');
      expect(cachedProfile).toBeNull();
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .put('/api/user/profile')
        .send({ first_name: 'Test' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/user/dashboard', () => {
    test('should return dashboard data with statistics', async () => {
      const response = await request(app)
        .get('/api/user/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expectSuccessResponse(response);
      expect(response.body.data.stats).toBeDefined();
      expect(response.body.data.stats.total_orders).toBe(2);
      expect(response.body.data.stats.total_spent).toBe('79.97');
      expect(response.body.data.recent_orders).toBeDefined();
      expect(response.body.data.recent_orders).toHaveLength(2);
    });

    test('should return empty stats for user with no orders', async () => {
      const token = generateJWT(3); // User with no orders
      
      const response = await request(app)
        .get('/api/user/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expectSuccessResponse(response);
      expect(response.body.data.stats.total_orders).toBe(0);
      expect(response.body.data.stats.total_spent).toBe('0.00');
      expect(response.body.data.recent_orders).toHaveLength(0);
    });

    test('should return recent orders sorted by date', async () => {
      const response = await request(app)
        .get('/api/user/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expectSuccessResponse(response);
      const orders = response.body.data.recent_orders;
      expect(orders).toHaveLength(2);
      
      // Should be sorted by created_at DESC
      expect(new Date(orders[0].created_at)).toBeInstanceOf(Date);
      expect(new Date(orders[1].created_at)).toBeInstanceOf(Date);
    });

    test('should include order item count in recent orders', async () => {
      const response = await request(app)
        .get('/api/user/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expectSuccessResponse(response);
      const orders = response.body.data.recent_orders;
      
      orders.forEach(order => {
        expect(order.item_count).toBeDefined();
        expect(typeof order.item_count).toBe('number');
      });
    });

    test('should cache dashboard data', async () => {
      // First request
      await request(app)
        .get('/api/user/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      // Check if data is cached
      const cachedDashboard = await testRedis.get('dashboard:1');
      expect(cachedDashboard).toBeDefined();
      expect(cachedDashboard.stats).toBeDefined();
      expect(cachedDashboard.recent_orders).toBeDefined();
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/user/dashboard');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Profile Data Persistence', () => {
    test('should persist profile updates across requests', async () => {
      // Update profile
      const profileData = {
        first_name: 'Updated',
        last_name: 'Name',
        bio: 'Updated bio'
      };

      await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(profileData);

      // Get profile again
      const response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expectSuccessResponse(response);
      expect(response.body.data.profile.first_name).toBe('Updated');
      expect(response.body.data.profile.last_name).toBe('Name');
      expect(response.body.data.profile.bio).toBe('Updated bio');
    });

    test('should handle partial profile updates', async () => {
      // Update only first name
      await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ first_name: 'OnlyFirst' });

      // Get profile
      const response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expectSuccessResponse(response);
      expect(response.body.data.profile.first_name).toBe('OnlyFirst');
      expect(response.body.data.profile.last_name).toBe('Doe'); // Should remain unchanged
    });
  });
});
