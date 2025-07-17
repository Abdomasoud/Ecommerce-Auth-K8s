# Security Guidelines

## Environment Variables
- **NEVER** commit `.env` files to version control
- Use `.env.example` as a template
- Generate strong secrets for production:
  ```bash
  # Generate JWT secret (32+ characters)
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  
  # Generate session secret (32+ characters)  
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

## AWS Credentials
- Use IAM roles in production instead of hardcoded keys
- For development, use AWS CLI profiles
- Never commit AWS credentials to version control

## Database Security
- Use strong passwords (12+ characters, mixed case, numbers, symbols)
- Enable SSL/TLS for database connections
- Use connection pooling and parameterized queries

## Redis Security
- Enable authentication in production
- Use TLS encryption for data in transit
- Set appropriate timeout values

## JWT Security
- Use strong secrets (32+ characters)
- Set appropriate expiration times
- Implement token blacklisting for logout

## Rate Limiting
- Implement rate limiting on all API endpoints
- Use lower limits for authentication endpoints
- Monitor and log excessive requests

## Content Security Policy
- Implement strict CSP headers
- Avoid inline scripts and styles
- Use nonces or hashes for required inline content

## Input Validation
- Validate all user inputs
- Use parameterized queries for database operations
- Sanitize HTML content to prevent XSS

## Error Handling
- Don't expose sensitive information in error messages
- Log errors securely without exposing credentials
- Use generic error messages for public APIs

## HTTPS
- Always use HTTPS in production
- Implement HSTS headers
- Use strong SSL/TLS configurations
