# Multi-stage Dockerfile for development and production

# Development stage
FROM node:18-alpine AS development

# Install curl for healthcheck
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for development)
RUN npm ci && npm cache clean --force

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Development command
CMD ["npm", "run", "dev"]

# Production stage
FROM node:18-alpine AS production

# Install curl for healthcheck and ca-certificates for HTTPS
RUN apk add --no-cache curl ca-certificates

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy application code
COPY . .

# Remove unnecessary files for production
RUN rm -rf tests docs *.md Jenkinsfile* docker-compose*.yml

# Change ownership of app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Set production environment variables
ENV NODE_ENV=production
ENV USE_CSI_DRIVER=false
ENV USE_SECRETS_MANAGER=false

# Create directory for CSI mounted secrets
USER root
RUN mkdir -p /tmp && chown nodejs:nodejs /tmp
USER nodejs

# Expose port
EXPOSE 3000

# Health check - updated for better Kubernetes integration
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "start"]