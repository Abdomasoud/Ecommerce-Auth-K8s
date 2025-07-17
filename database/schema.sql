-- User Authentication Database Schema for PostgreSQL
-- This script creates the necessary tables for the Node.js user authentication application

-- Create the database (run this first as superuser)
-- CREATE DATABASE user_auth_db;
-- \c user_auth_db;

-- Create ENUM types for PostgreSQL
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Users table - stores user account information
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);

-- User profiles table - stores additional user information
CREATE TABLE IF NOT EXISTS user_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    phone VARCHAR(20),
    bio TEXT,
    avatar_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for user_profiles table
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Products table - stores product information
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    category VARCHAR(50),
    image_url VARCHAR(255),
    stock_quantity INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for products table
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);

-- Orders table - stores order information
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_amount DECIMAL(10, 2) NOT NULL,
    status order_status DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for orders table
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Order items table - stores individual items in each order
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for order_items table
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- Sessions table - for storing session data (optional, as we're using Redis)
CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(128) PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    data TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for sessions table
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Create triggers for updating updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables with updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data
INSERT INTO users (username, email, password_hash) VALUES
    ('john_doe', 'john@example.com', '$2b$10$rOzJUaOjkGVXcKGJ9YWrMe8kNKfOLiYj4qNEYaOcpzCcHhDhkQZe6'), -- password: password123
    ('jane_smith', 'jane@example.com', '$2b$10$rOzJUaOjkGVXcKGJ9YWrMe8kNKfOLiYj4qNEYaOcpzCcHhDhkQZe6'), -- password: password123
    ('mike_wilson', 'mike@example.com', '$2b$10$rOzJUaOjkGVXcKGJ9YWrMe8kNKfOLiYj4qNEYaOcpzCcHhDhkQZe6') -- password: password123
ON CONFLICT (username) DO NOTHING;

INSERT INTO user_profiles (user_id, first_name, last_name, phone) VALUES
    (1, 'John', 'Doe', '+1234567890'),
    (2, 'Jane', 'Smith', '+1234567891'),
    (3, 'Mike', 'Wilson', '+1234567892')
ON CONFLICT DO NOTHING;

INSERT INTO products (name, description, price, category, stock_quantity) VALUES
    ('Laptop', 'High-performance laptop for professionals', 999.99, 'Electronics', 50),
    ('Smartphone', 'Latest model smartphone with advanced features', 699.99, 'Electronics', 100),
    ('Headphones', 'Wireless noise-cancelling headphones', 199.99, 'Electronics', 75),
    ('Coffee Maker', 'Automatic coffee maker with multiple settings', 149.99, 'Home', 30),
    ('Desk Chair', 'Ergonomic office chair with lumbar support', 299.99, 'Furniture', 25),
    ('Book', 'Programming best practices guide', 39.99, 'Books', 200),
    ('T-Shirt', 'Comfortable cotton t-shirt', 19.99, 'Clothing', 150),
    ('Jeans', 'Classic denim jeans', 59.99, 'Clothing', 100),
    ('Running Shoes', 'Lightweight running shoes', 129.99, 'Sports', 60),
    ('Backpack', 'Durable travel backpack', 79.99, 'Travel', 40)
ON CONFLICT DO NOTHING;
);

-- Insert sample products for testing
INSERT INTO products (name, description, price, category, stock_quantity) VALUES
('Wireless Bluetooth Headphones', 'High-quality wireless headphones with noise cancellation', 89.99, 'Electronics', 50),
('Smart Fitness Watch', 'Track your fitness goals with this advanced smartwatch', 199.99, 'Electronics', 30),
('Premium Coffee Beans', 'Freshly roasted coffee beans from premium farms', 24.99, 'Food', 100),
('Organic Green Tea', 'Refreshing organic green tea with antioxidants', 15.99, 'Food', 75),
('Wireless Charging Pad', 'Fast wireless charging for your devices', 39.99, 'Electronics', 40),
('Yoga Mat', 'Eco-friendly yoga mat for your workout routine', 29.99, 'Sports', 60),
('Stainless Steel Water Bottle', 'Insulated water bottle keeps drinks cold for 24 hours', 19.99, 'Sports', 80),
('Gaming Mechanical Keyboard', 'RGB mechanical keyboard for gaming enthusiasts', 129.99, 'Electronics', 25),
('Essential Oil Diffuser', 'Create a relaxing atmosphere with this aromatherapy diffuser', 49.99, 'Home', 35),
('Portable Phone Charger', 'High-capacity portable charger for mobile devices', 34.99, 'Electronics', 45);

-- Create indexes for better performance
CREATE INDEX idx_users_email_password ON users(email, password_hash);
CREATE INDEX idx_products_category_price ON products(category, price);
CREATE INDEX idx_orders_user_status ON orders(user_id, status);
CREATE INDEX idx_order_items_order_product ON order_items(order_id, product_id);

-- Create a view for user order summary
CREATE VIEW user_order_summary AS
SELECT 
    u.id as user_id,
    u.username,
    u.email,
    COUNT(o.id) as total_orders,
    COALESCE(SUM(o.total_amount), 0) as total_spent,
    MAX(o.created_at) as last_order_date
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.username, u.email;

-- Create a view for product sales summary
CREATE VIEW product_sales_summary AS
SELECT 
    p.id as product_id,
    p.name,
    p.category,
    p.price,
    COALESCE(SUM(oi.quantity), 0) as total_sold,
    COALESCE(SUM(oi.total_price), 0) as total_revenue,
    COUNT(DISTINCT oi.order_id) as total_orders
FROM products p
LEFT JOIN order_items oi ON p.id = oi.product_id
GROUP BY p.id, p.name, p.category, p.price;

-- Sample queries for testing:

-- Get user with profile information
-- SELECT u.*, p.first_name, p.last_name, p.phone, p.bio 
-- FROM users u 
-- LEFT JOIN user_profiles p ON u.id = p.user_id 
-- WHERE u.email = 'user@example.com';

-- Get user's orders with items
-- SELECT o.*, COUNT(oi.id) as item_count, SUM(oi.total_price) as order_total
-- FROM orders o
-- LEFT JOIN order_items oi ON o.id = oi.order_id
-- WHERE o.user_id = 1
-- GROUP BY o.id
-- ORDER BY o.created_at DESC;

-- Get popular products
-- SELECT p.*, SUM(oi.quantity) as total_sold
-- FROM products p
-- LEFT JOIN order_items oi ON p.id = oi.product_id
-- GROUP BY p.id
-- ORDER BY total_sold DESC
-- LIMIT 10;

-- Performance optimization notes:
-- 1. Indexes are created for frequently queried columns
-- 2. Foreign keys ensure data integrity
-- 3. ENUM type for order status provides better performance than VARCHAR
-- 4. Timestamps have appropriate indexes for date-based queries
-- 5. Views provide pre-computed summaries for dashboard queries

-- Security notes:
-- 1. Password hashes are stored, never plain text passwords
-- 2. Email and username have unique constraints
-- 3. Foreign key constraints prevent orphaned records
-- 4. User accounts can be deactivated with is_active flag
-- 5. Session management through Redis provides better security

-- Backup and maintenance:
-- 1. Regular backups should be scheduled
-- 2. Old sessions should be cleaned up periodically
-- 3. Monitor slow queries and optimize indexes as needed
-- 4. Consider partitioning for large datasets in production
