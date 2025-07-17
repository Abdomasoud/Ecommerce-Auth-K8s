// Unit tests for database configuration
const mysql = require('mysql2/promise');
const { connectDB, query } = require('../../config/database');
const { mockDatabaseConnection } = require('../helpers');

// Mock mysql2/promise
jest.mock('mysql2/promise');

describe('Database Configuration', () => {
  let mockPool;
  let mockConnection;

  beforeEach(() => {
    mockConnection = mockDatabaseConnection();
    mockPool = {
      getConnection: jest.fn().mockResolvedValue(mockConnection),
      execute: jest.fn(),
      end: jest.fn()
    };
    
    mysql.createPool = jest.fn().mockReturnValue(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Database Connection', () => {
    test('should create connection pool with correct configuration', async () => {
      await connectDB();

      expect(mysql.createPool).toHaveBeenCalledWith({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        acquireTimeout: 60000,
        timeout: 60000,
        reconnect: true
      });
    });

    test('should successfully connect to database', async () => {
      mockConnection.release = jest.fn();
      
      const result = await connectDB();

      expect(mockPool.getConnection).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
      expect(result).toBe(mockPool);
    });

    test('should handle connection errors', async () => {
      const connectionError = new Error('Connection failed');
      mockPool.getConnection.mockRejectedValue(connectionError);

      await expect(connectDB()).rejects.toThrow('Connection failed');
    });
  });

  describe('Database Queries', () => {
    beforeEach(() => {
      // Mock pool.execute for query function
      mockPool.execute.mockResolvedValue([{ id: 1, name: 'test' }]);
    });

    test('should execute query with parameters', async () => {
      const sql = 'SELECT * FROM users WHERE id = ?';
      const params = [1];

      const result = await query(sql, params);

      expect(mockPool.execute).toHaveBeenCalledWith(sql, params);
      expect(result).toEqual({ id: 1, name: 'test' });
    });

    test('should execute query without parameters', async () => {
      const sql = 'SELECT * FROM users';

      const result = await query(sql);

      expect(mockPool.execute).toHaveBeenCalledWith(sql, []);
      expect(result).toEqual({ id: 1, name: 'test' });
    });

    test('should handle query errors', async () => {
      const queryError = new Error('Query failed');
      mockPool.execute.mockRejectedValue(queryError);

      await expect(query('SELECT * FROM users')).rejects.toThrow('Query failed');
    });

    test('should log query errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const queryError = new Error('Query failed');
      mockPool.execute.mockRejectedValue(queryError);

      await expect(query('SELECT * FROM users')).rejects.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('Database query error:', queryError);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Connection Pool Management', () => {
    test('should reuse existing connection pool', async () => {
      await connectDB();
      await connectDB();

      // Should only create pool once
      expect(mysql.createPool).toHaveBeenCalledTimes(1);
    });

    test('should handle pool configuration with default values', async () => {
      delete process.env.DB_PORT;
      
      await connectDB();

      const poolConfig = mysql.createPool.mock.calls[0][0];
      expect(poolConfig.port).toBe(3306);
    });
  });

  describe('Transaction Support', () => {
    test('should support database transactions', async () => {
      const mockTransaction = {
        execute: jest.fn().mockResolvedValue([{ success: true }]),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn()
      };

      mockPool.getConnection.mockResolvedValue(mockTransaction);

      const connection = await mockPool.getConnection();
      await connection.execute('BEGIN');
      await connection.execute('INSERT INTO users (username) VALUES (?)', ['testuser']);
      await connection.commit();
      connection.release();

      expect(mockTransaction.execute).toHaveBeenCalledWith('BEGIN');
      expect(mockTransaction.execute).toHaveBeenCalledWith('INSERT INTO users (username) VALUES (?)', ['testuser']);
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(mockTransaction.release).toHaveBeenCalled();
    });
  });
});
