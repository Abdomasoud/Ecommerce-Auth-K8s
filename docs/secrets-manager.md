# AWS Secrets Manager Configuration

This document explains how to configure AWS Secrets Manager for the User Authentication Application.

## Overview

The application supports two configuration modes:
1. **Development Mode**: Uses environment variables from `.env` file
2. **Production Mode**: Uses AWS Secrets Manager for sensitive data

## Configuration Modes

### Development Mode (Local Testing)
- Set `USE_SECRETS_MANAGER=false` in `.env`
- Or simply use `npm start` or `npm run dev` (defaults to env vars)
- All configuration comes from environment variables

### Production Mode (Docker/AWS)
- Set `USE_SECRETS_MANAGER=true` or `NODE_ENV=production`
- Application will fetch secrets from AWS Secrets Manager
- Falls back to environment variables if Secrets Manager fails

## AWS Secrets Manager Setup

### 1. Create Secrets in AWS Secrets Manager

You need to create three secrets in AWS Secrets Manager:

#### Database Secret (`user-auth-app/database`)
```json
{
  "host": "your-rds-endpoint.amazonaws.com",
  "username": "your-db-username", 
  "password": "your-db-password",
  "database": "user_auth_db",
  "port": 3306
}
```

#### Redis Secret (`user-auth-app/redis`)
```json
{
  "host": "your-elasticache-endpoint.amazonaws.com",
  "port": 6379,
  "password": "your-redis-password"
}
```

#### Application Secret (`user-auth-app/application`)
```json
{
  "jwt_secret": "your-super-secret-jwt-key-here",
  "jwt_expires_in": "7d",
  "session_secret": "your-session-secret-key-here",
  "session_max_age": 86400000
}
```

### 2. AWS CLI Commands to Create Secrets

```bash
# Create database secret
aws secretsmanager create-secret \
  --name "user-auth-app/database" \
  --description "Database credentials for user auth app" \
  --secret-string '{
    "host": "your-rds-endpoint.amazonaws.com",
    "username": "your-db-username",
    "password": "your-db-password",
    "database": "user_auth_db",
    "port": 3306
  }'

# Create Redis secret
aws secretsmanager create-secret \
  --name "user-auth-app/redis" \
  --description "Redis credentials for user auth app" \
  --secret-string '{
    "host": "your-elasticache-endpoint.amazonaws.com",
    "port": 6379,
    "password": "your-redis-password"
  }'

# Create application secret
aws secretsmanager create-secret \
  --name "user-auth-app/application" \
  --description "Application secrets for user auth app" \
  --secret-string '{
    "jwt_secret": "your-super-secret-jwt-key-here",
    "jwt_expires_in": "7d",
    "session_secret": "your-session-secret-key-here",
    "session_max_age": 86400000
  }'
```

### 3. IAM Permissions

Your application needs the following IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:*:*:secret:user-auth-app/database*",
        "arn:aws:secretsmanager:*:*:secret:user-auth-app/redis*",
        "arn:aws:secretsmanager:*:*:secret:user-auth-app/application*"
      ]
    }
  ]
}
```

### 4. Environment Variables for Production

Set these environment variables in your production environment:

```bash
# Required for production
NODE_ENV=production
USE_SECRETS_MANAGER=true
AWS_REGION=us-east-1

# Optional - override default secret names
DB_SECRET_NAME=user-auth-app/database
REDIS_SECRET_NAME=user-auth-app/redis
APP_SECRET_NAME=user-auth-app/application

# Application settings
PORT=3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Docker Configuration

### Development Docker Compose
```yaml
version: '3.8'
services:
  app:
    build: .
    environment:
      - NODE_ENV=development
      - USE_SECRETS_MANAGER=false
      - DB_HOST=mysql
      - DB_USER=root
      # ... other env vars
```

### Production Docker
```bash
# Build and run with Secrets Manager
docker build -t user-auth-app .
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e USE_SECRETS_MANAGER=true \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=your-access-key \
  -e AWS_SECRET_ACCESS_KEY=your-secret-key \
  user-auth-app
```

## ECS/Fargate Configuration

### Task Definition Environment Variables
```json
{
  "environment": [
    {
      "name": "NODE_ENV",
      "value": "production"
    },
    {
      "name": "USE_SECRETS_MANAGER", 
      "value": "true"
    },
    {
      "name": "AWS_REGION",
      "value": "us-east-1"
    }
  ]
}
```

### Task Role Policy
Attach the IAM policy mentioned above to your ECS task role.

## Troubleshooting

### Common Issues

1. **Secrets Manager Access Denied**
   - Check IAM permissions
   - Verify secret names match configuration
   - Ensure AWS region is correct

2. **Fallback to Environment Variables**
   - Application will log "Falling back to environment variables..."
   - Check AWS credentials and permissions
   - Verify secret names exist in Secrets Manager

3. **Secret Parsing Errors**
   - Ensure secrets are valid JSON
   - Check that all required fields are present
   - Verify data types match expectations

### Logs
The application logs will show:
- Configuration mode being used
- Secrets being fetched
- Any fallback scenarios
- Connection status for database and Redis

### Testing Secrets Manager Locally

To test Secrets Manager locally:

```bash
# Set environment variables
export USE_SECRETS_MANAGER=true
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key

# Run application
npm start
```

## Security Best Practices

1. **Use different secrets for different environments**
2. **Rotate secrets regularly**
3. **Use least privilege IAM policies**
4. **Monitor secret access with CloudTrail**
5. **Use VPC endpoints for Secrets Manager in production**

## Cost Optimization

1. **Cache secrets** - Application caches secrets for 5 minutes
2. **Use secret rotation** - Only when necessary
3. **Monitor API calls** - Track GetSecretValue calls

## Monitoring

Monitor the following metrics:
- Secrets Manager API calls
- Application startup time
- Configuration load failures
- Fallback scenarios

The application provides detailed logging for configuration loading and secret management.
