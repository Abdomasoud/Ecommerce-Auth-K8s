// Test script to verify password handling
require('dotenv').config();
console.log('Testing password handling...');

// Test environment variable loading
const password = process.env.DB_PASSWORD;
console.log('Password loaded:', password ? '✅ Successfully loaded' : '❌ Failed to load');
console.log('Password length:', password ? password.length : 'N/A');

// Test that special characters are preserved
const expectedPassword = 'piw5zh=U?mB#apdR';
if (password === expectedPassword) {
    console.log('✅ Password matches expected value');
} else {
    console.log('❌ Password does not match expected value');
    console.log('Expected: [REDACTED]');
    console.log('Actual: [REDACTED]');
}

// Test Redis password too
const redisPassword = process.env.REDIS_PASSWORD;
console.log('Redis password loaded:', redisPassword ? '✅ Successfully loaded' : '❌ Failed to load');

// Test database connection string construction
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
};

console.log('Database config:', {
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password ? '***MASKED***' : 'MISSING',
    database: dbConfig.database,
    port: dbConfig.port
});
