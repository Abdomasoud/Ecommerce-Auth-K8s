# Docker Usage Guide

## Overview

This application is fully containerized with PostgreSQL and Redis services for easy development and production deployment.

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+

## Development Setup

### 1. Start Development Environment

```bash
# Start all services (app, postgres, redis)
docker-compose up app-dev

# Start in background
docker-compose up -d app-dev

# View logs
docker-compose logs -f app-dev
```

### 2. Access Services

- **Application**: http://localhost:3000
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### 3. Database Management

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U ecommerce_admin -d ecommerce_db

# View database logs
docker-compose logs postgres

# Reset database
docker-compose down -v
docker-compose up postgres -d
```

### 4. Redis Management

```bash
# Connect to Redis
docker-compose exec redis redis-cli

# View Redis logs
docker-compose logs redis

# Monitor Redis
docker-compose exec redis redis-cli monitor
```

## Production Setup

### 1. Build Production Image

```bash
# Build production image
docker-compose build app-prod

# Start production services
docker-compose --profile production up app-prod
```

### 2. Environment Variables

Set these environment variables for production:

```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
```

## Useful Commands

### Development Commands

```bash
# Rebuild services
docker-compose build

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v

# View service status
docker-compose ps

# Execute commands in container
docker-compose exec app-dev npm test
```

### Debugging

```bash
# Access container shell
docker-compose exec app-dev sh

# View application logs
docker-compose logs -f app-dev

# Check service health
docker-compose exec app-dev curl http://localhost:3000/
```

### Database Operations

```bash
# Backup database
docker-compose exec postgres pg_dump -U ecommerce_admin ecommerce_db > backup.sql

# Restore database
docker-compose exec -T postgres psql -U ecommerce_admin ecommerce_db < backup.sql

# Check database connection
docker-compose exec app-dev node -e "const {query} = require('./config/database'); query('SELECT NOW()').then(console.log)"
```

## File Structure

```
.
├── Dockerfile                 # Multi-stage build (dev/prod)
├── docker-compose.yml         # Main compose file
├── docker-compose.override.yml # Development overrides
├── .dockerignore              # Docker ignore file
└── database/
    └── schema.sql             # Database initialization
```

## Health Checks

All services include health checks:

- **Application**: HTTP health endpoint
- **PostgreSQL**: pg_isready command
- **Redis**: redis-cli ping

## Volumes

- `postgres_data`: PostgreSQL data persistence
- `redis_data`: Redis data persistence
- `node_modules`: Node.js dependencies cache

## Networks

- `app-network`: Bridge network for service communication

## Troubleshooting

### Common Issues

1. **Port conflicts**: Change ports in docker-compose.yml
2. **Permission issues**: Check file ownership and Docker permissions
3. **Database connection**: Verify health checks and wait for services to start
4. **Redis connection**: Check Redis logs and ensure service is healthy

### Logs

```bash
# View all logs
docker-compose logs

# View specific service logs
docker-compose logs postgres
docker-compose logs redis
docker-compose logs app-dev

# Follow logs in real-time
docker-compose logs -f app-dev
```

## Performance Tips

1. **Use .dockerignore**: Exclude unnecessary files
2. **Multi-stage builds**: Separate dev and prod stages
3. **Layer caching**: Copy package.json before source code
4. **Volume mounts**: Use volumes for persistent data
5. **Health checks**: Wait for services to be ready

## Security Considerations

1. **Non-root user**: Application runs as nodejs user
2. **Environment variables**: Use .env files for secrets
3. **Network isolation**: Services communicate through bridge network
4. **Volume permissions**: Proper file ownership
5. **Production secrets**: Use AWS Secrets Manager in production
