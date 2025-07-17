-- Create user if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ecommerce_admin') THEN
        CREATE USER ecommerce_admin WITH PASSWORD 'local_dev_password';
    END IF;
END
$$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE ecommerce_db TO ecommerce_admin;
GRANT ALL ON SCHEMA public TO ecommerce_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO ecommerce_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ecommerce_admin;

-- Make sure the user can create tables
ALTER USER ecommerce_admin CREATEDB;
