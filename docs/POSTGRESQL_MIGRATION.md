# PostgreSQL Migration Guide

## Overview
This document outlines the migration from MySQL to PostgreSQL for the Node.js User Authentication Application.

## Changes Made

### 1. Dependencies Updated
- **Removed**: `mysql2` package
- **Added**: `pg` (PostgreSQL driver)
- **Updated**: Test dependencies to use `pg-mem` instead of `mysql2-mock`

### 2. Database Configuration Changes
- **File**: `config/database.js`
- **Changes**:
  - Replaced `mysql2/promise` with `pg` Pool
  - Updated connection configuration for PostgreSQL
  - Changed default port from 3306 to 5432
  - Updated query method to return `result.rows`
  - Added PostgreSQL SSL configuration for production

### 3. Schema Conversion
- **File**: `database/schema.sql`
- **Changes**:
  - Converted MySQL syntax to PostgreSQL
  - `AUTO_INCREMENT` → `SERIAL`
  - `INT` → `INTEGER`
  - `ENUM` → Custom PostgreSQL ENUM types
  - `NOW()` → `CURRENT_TIMESTAMP`
  - Added `IF NOT EXISTS` clauses
  - Created triggers for `updated_at` column updates
  - Added `RETURNING` clause for INSERT statements

### 4. Query Parameter Changes
- **Files**: All route files and middleware
- **Changes**:
  - MySQL placeholders `?` → PostgreSQL placeholders `$1, $2, $3, etc.`
  - Updated `INSERT` statements to use `RETURNING id`
  - Changed `result.insertId` to `result[0].id`

### 5. Environment Configuration
- **File**: `.env`
- **Changes**:
  - Updated default `DB_PORT` from 3306 to 5432
  - All other database configuration remains the same

### 6. Test Configuration
- **Files**: Test setup and helpers
- **Changes**:
  - Updated test database configuration
  - Changed test helpers to use PostgreSQL Pool
  - Updated table reset logic to use PostgreSQL sequences
  - Modified seed data to use PostgreSQL syntax

### 7. Jenkins Pipeline Updates
- **Files**: `Jenkinsfile`, `Jenkinsfile.simple`, `docs/JENKINS_SETUP.md`
- **Changes**:
  - Updated database setup scripts for PostgreSQL
  - Changed test database port configuration
  - Updated database cleanup commands
  - Modified troubleshooting documentation

## Migration Steps

### 1. Install PostgreSQL
```bash
# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib -y

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2. Create Database and User
```bash
# Switch to postgres user
sudo -u postgres psql

-- Create database
CREATE DATABASE ecommerce_db;

-- Create user with password
CREATE USER your_db_username WITH ENCRYPTED PASSWORD 'your_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE ecommerce_db TO your_db_username;
ALTER USER your_db_username CREATEDB;

-- Exit psql
\q
```

### 3. Import Schema
```bash
# Import the PostgreSQL schema
PGPASSWORD=your_password psql -h your-rds-endpoint.amazonaws.com -U your_db_username -d ecommerce_db -f database/schema.sql
```

### 4. Update Environment Variables
```bash
# Update your .env file
DB_HOST=your-rds-endpoint.amazonaws.com
DB_USER=your_db_username
DB_PASSWORD=your_password
DB_NAME=ecommerce_db
DB_PORT=5432
```

### 5. Update Dependencies
```bash
# Remove MySQL dependency and install PostgreSQL
npm uninstall mysql2
npm install pg

# Update dev dependencies
npm uninstall mysql2-mock
npm install pg-mem
```

### 6. Test the Migration
```bash
# Run tests to verify everything works
npm test

# Start the application
npm start
```

## Key Differences Between MySQL and PostgreSQL

### 1. Data Types
| MySQL | PostgreSQL |
|-------|------------|
| `INT AUTO_INCREMENT` | `SERIAL` |
| `INT` | `INTEGER` |
| `ENUM('a','b','c')` | Custom ENUM type |
| `TIMESTAMP DEFAULT NOW()` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` |

### 2. Query Syntax
| MySQL | PostgreSQL |
|-------|------------|
| `SELECT * FROM users WHERE id = ?` | `SELECT * FROM users WHERE id = $1` |
| `INSERT INTO users (...) VALUES (...)` | `INSERT INTO users (...) VALUES (...) RETURNING id` |
| `LIMIT 10 OFFSET 5` | `LIMIT 10 OFFSET 5` (same) |

### 3. Connection Handling
| MySQL | PostgreSQL |
|-------|------------|
| Connection pools with `mysql2` | Connection pools with `pg` Pool |
| `connection.execute()` | `pool.query()` |
| `result.insertId` | `result[0].id` (with RETURNING) |

### 4. Schema Management
| MySQL | PostgreSQL |
|-------|------------|
| `AUTO_INCREMENT` reset | `ALTER SEQUENCE table_id_seq RESTART WITH 1` |
| `SHOW TABLES` | `\dt` or `SELECT * FROM information_schema.tables` |
| `DESC table_name` | `\d table_name` |

## AWS RDS PostgreSQL Configuration

### 1. Create RDS PostgreSQL Instance
```bash
# Using AWS CLI
aws rds create-db-instance \
  --db-instance-identifier myapp-postgres \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username myuser \
  --master-user-password mypassword \
  --allocated-storage 20 \
  --vpc-security-group-ids sg-xxxxxxxx
```

### 2. Configure Security Group
- Allow inbound connections on port 5432
- Restrict access to application security groups
- Enable SSL/TLS for production

### 3. Update Secrets Manager
```json
{
  "host": "myapp-postgres.xxxxx.us-east-1.rds.amazonaws.com",
  "port": 5432,
  "database": "ecommerce_db",
  "username": "myuser",
  "password": "mypassword"
}
```

## Performance Considerations

### 1. Connection Pooling
```javascript
// PostgreSQL connection pool configuration
const pool = new Pool({
  host: config.DB_HOST,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME,
  port: config.DB_PORT || 5432,
  max: 20,                    // Maximum connections
  idleTimeoutMillis: 30000,   // Close idle connections
  connectionTimeoutMillis: 2000
});
```

### 2. Query Optimization
- Use prepared statements with parameterized queries
- Add appropriate indexes on frequently queried columns
- Use `EXPLAIN ANALYZE` for query performance analysis
- Consider using `VACUUM` and `ANALYZE` for maintenance

### 3. Monitoring
- Monitor connection pool usage
- Track query performance
- Set up alerts for connection limits
- Monitor database size and growth

## Testing

### 1. Unit Tests
```bash
# Run unit tests
npm run test:unit
```

### 2. Integration Tests
```bash
# Run integration tests
npm run test:integration
```

### 3. Database-Specific Tests
```bash
# Test database connectivity
node -e "
const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  user: 'testuser',
  password: 'testpass',
  database: 'test_db',
  port: 5432
});
pool.query('SELECT NOW()', (err, res) => {
  if (err) throw err;
  console.log('PostgreSQL connected:', res.rows[0].now);
  pool.end();
});
"
```

## Rollback Plan

If you need to rollback to MySQL:

1. **Restore MySQL dependencies**:
   ```bash
   npm uninstall pg
   npm install mysql2
   ```

2. **Restore MySQL configuration**:
   - Revert `config/database.js` to MySQL version
   - Update `.env` to use port 3306
   - Restore MySQL schema

3. **Update queries**:
   - Change `$1, $2, $3` back to `?` placeholders
   - Remove `RETURNING` clauses
   - Update `result[0].id` to `result.insertId`

## Troubleshooting

### 1. Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection
PGPASSWORD=password psql -h host -U user -d database -c "SELECT version();"

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### 2. Query Errors
- Check parameter placeholder syntax (`$1` vs `?`)
- Verify ENUM types are created
- Check for case sensitivity in table/column names
- Ensure `RETURNING` clause is used for INSERT statements

### 3. Performance Issues
- Monitor connection pool usage
- Check for missing indexes
- Use `EXPLAIN ANALYZE` for slow queries
- Consider increasing connection pool size

## References

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [node-postgres (pg) Documentation](https://node-postgres.com/)
- [AWS RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [PostgreSQL vs MySQL Comparison](https://www.postgresql.org/about/featurematrix/)

## Migration Checklist

- [ ] Install PostgreSQL dependencies
- [ ] Update database configuration
- [ ] Convert schema to PostgreSQL
- [ ] Update all SQL queries
- [ ] Update environment variables
- [ ] Update test configuration
- [ ] Update Jenkins pipeline
- [ ] Test all endpoints
- [ ] Verify authentication works
- [ ] Test Redis integration
- [ ] Update documentation
- [ ] Deploy to staging
- [ ] Performance testing
- [ ] Production deployment
