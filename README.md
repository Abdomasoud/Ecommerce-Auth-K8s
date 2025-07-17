# User Authentication Application

A full-stack Node.js application with user authentication, RDS database integration, and ElasticCache (Redis) for session management and caching.

## Features

- **User Authentication**: Secure signup/signin with JWT tokens
- **Session Management**: Redis-based session storage with automatic expiration
- **Database Integration**: MySQL RDS for persistent data storage
- **Caching Layer**: Redis ElasticCache for improved performance
- **Product Management**: Browse and order products
- **User Dashboard**: View account statistics and order history
- **Responsive Design**: Mobile-friendly interface
- **Security**: Password hashing, rate limiting, input validation
- **Performance**: Optimized queries and caching strategies

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MySQL (RDS)
- **Cache**: Redis (ElasticCache)
- **Authentication**: JWT, bcrypt
- **Frontend**: HTML, CSS, JavaScript
- **Security**: Helmet, CORS, Rate Limiting

## Project Structure

```
application/
├── config/
│   ├── database.js          # MySQL database configuration
│   └── redis.js             # Redis client configuration
├── middleware/
│   └── auth.js              # JWT authentication middleware
├── routes/
│   ├── auth.js              # Authentication routes
│   ├── user.js              # User profile routes
│   └── products.js          # Product and order routes
├── public/
│   ├── index.html           # Landing page
│   ├── login.html           # Login page
│   ├── signup.html          # Signup page
│   └── dashboard.html       # User dashboard
├── database/
│   └── schema.sql           # Database schema and sample data
├── server.js                # Main application server
├── package.json             # Dependencies and scripts
└── .env                     # Environment variables
```

## Database Schema

The application uses the following main tables:

- **users**: User account information
- **user_profiles**: Additional user profile data
- **products**: Product catalog
- **orders**: Order information
- **order_items**: Individual items in orders
- **sessions**: Session data (optional, as Redis is primary)

## 🔐 Configuration Management

The application supports two configuration modes:

### Development Mode (Local Testing)
- Uses environment variables from `.env` file
- Set `USE_SECRETS_MANAGER=false` or leave unset
- All sensitive data comes from environment variables

### Production Mode (AWS/Docker)
- Uses AWS Secrets Manager for sensitive data
- Set `USE_SECRETS_MANAGER=true` or `NODE_ENV=production`
- Falls back to environment variables if Secrets Manager fails

## 🚀 Setup Instructions

### ⚠️ Security Warning

**Before you start**: This application contains sensitive configuration. Please review `SECURITY.md` before deployment.

- **Never commit `.env` files** - they contain sensitive credentials
- **Use strong passwords** for database and Redis
- **Generate secure JWT secrets** (32+ characters)
- **Enable HTTPS** in production
- **Use IAM roles** instead of hardcoded AWS credentials in production

### Local Development Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   Update `.env` file with your local configuration:
   ```env
   USE_SECRETS_MANAGER=false
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your-password
   # ... other local settings
   ```

3. **Set up local database**
   ```bash
   # Using Docker Compose (recommended)
   docker-compose up mysql redis -d
   
   # Or install MySQL and Redis locally
   mysql -u root -p < database/schema.sql
   ```

4. **Start the application**
   ```bash
   npm run dev  # Development mode with nodemon
   # or
   npm start    # Production mode
   ```

### Production Setup with AWS Secrets Manager

1. **Create AWS Secrets Manager secrets**
   See [Secrets Manager Documentation](docs/secrets-manager.md) for detailed setup

2. **Configure IAM permissions**
   Ensure your application has `secretsmanager:GetSecretValue` permissions

3. **Set environment variables**
   ```bash
   export NODE_ENV=production
   export USE_SECRETS_MANAGER=true
   export AWS_REGION=us-east-1
   ```

4. **Deploy with Docker**
   ```bash
   docker build -t user-auth-app .
   docker run -d \
     -p 3000:3000 \
     -e NODE_ENV=production \
     -e USE_SECRETS_MANAGER=true \
     -e AWS_REGION=us-east-1 \
     user-auth-app
   ```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### User Management
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile
- `GET /api/user/dashboard` - Get dashboard data

### Products & Orders
- `GET /api/products` - Get products (with pagination)
- `GET /api/products/:id` - Get specific product
- `POST /api/products/order` - Create new order
- `GET /api/products/orders/my` - Get user's orders

## AWS Configuration

### RDS Setup
1. Create MySQL RDS instance
2. Configure security groups for application access
3. Set up database user and permissions
4. Run schema.sql to create tables

### ElasticCache Setup
1. Create Redis cluster in ElasticCache
2. Configure security groups for application access
3. Note the endpoint and port
4. Set up authentication if required

## Security Features

- **Password Security**: bcrypt hashing with salt rounds
- **JWT Tokens**: Secure token-based authentication
- **Rate Limiting**: Prevents brute force attacks
- **Input Validation**: Express-validator for request validation
- **CORS**: Configured for production domains
- **Helmet**: Security headers for protection
- **Session Security**: Secure session configuration

## Performance Optimizations

- **Redis Caching**: User data, products, and dashboard data
- **Database Indexing**: Optimized queries with proper indexes
- **Connection Pooling**: MySQL connection pool for efficiency
- **Pagination**: Efficient data loading with pagination
- **Cache Invalidation**: Smart cache clearing on data updates

## Development

### Running in Development Mode
```bash
npm run dev
```

### Environment Variables
Make sure to set up proper environment variables for:
- Database credentials
- Redis credentials
- JWT secrets
- Session secrets

### Database Migrations
For production, consider implementing a proper migration system:
```bash
# Example migration command
npm run migrate
```

## Production Deployment

### Prerequisites
- AWS RDS MySQL instance
- AWS ElasticCache Redis cluster
- EC2 instance or container platform
- Domain name and SSL certificate

### Environment Setup
1. Set `NODE_ENV=production`
2. Configure production database credentials
3. Set up SSL certificates
4. Configure load balancer if needed

### Monitoring
- Monitor RDS performance metrics
- Monitor Redis cache hit rates
- Set up CloudWatch alarms
- Monitor application logs

## Testing

### Manual Testing
1. Visit `/` for the landing page
2. Sign up with a new account
3. Login with credentials
4. Browse products in dashboard
5. Place test orders
6. Check order history

### API Testing
Use tools like Postman or curl to test API endpoints:
```bash
# Login example
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

## Troubleshooting

### Common Issues
1. **Database Connection**: Check RDS endpoint and credentials
2. **Redis Connection**: Verify ElasticCache endpoint and security groups
3. **JWT Errors**: Ensure JWT_SECRET is set correctly
4. **Session Issues**: Check Redis connection and session configuration

### Logs
Check application logs for detailed error information:
```bash
npm start 2>&1 | tee app.log
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes and test
4. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For issues and questions, please create an issue in the repository or contact the development team.
