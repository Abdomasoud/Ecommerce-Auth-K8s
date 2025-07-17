# Jenkins CI/CD Configuration Guide

## Overview
This document provides comprehensive instructions for setting up Jenkins CI/CD pipeline for the Node.js User Authentication Application.

## Prerequisites

### Jenkins Server Requirements
- **OS**: Ubuntu 20.04 LTS or later
- **RAM**: Minimum 2GB (Recommended 4GB+)
- **Storage**: At least 20GB free space
- **Java**: OpenJDK 11 or later
- **Docker**: Latest version
- **Git**: Latest version

### Required Jenkins Plugins
Install these plugins through Jenkins > Manage Jenkins > Manage Plugins:

```
- Pipeline
- Docker Pipeline
- Git
- GitHub
- NodeJS
- HTML Publisher
- JUnit
- Email Extension
- Build Timeout
- Timestamper
- Workspace Cleanup
- Blue Ocean (Optional but recommended)
```

## Jenkins Setup

### 1. Install Jenkins on Ubuntu

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Java
sudo apt install openjdk-11-jdk -y

# Add Jenkins repository
wget -q -O - https://pkg.jenkins.io/debian-stable/jenkins.io.key | sudo apt-key add -
sudo sh -c 'echo deb https://pkg.jenkins.io/debian-stable binary/ > /etc/apt/sources.list.d/jenkins.list'

# Install Jenkins
sudo apt update
sudo apt install jenkins -y

# Start Jenkins
sudo systemctl start jenkins
sudo systemctl enable jenkins

# Check status
sudo systemctl status jenkins
```

### 2. Initial Jenkins Configuration

1. **Access Jenkins**: Open `http://your-server-ip:8080`
2. **Unlock Jenkins**: Use initial admin password from:
   ```bash
   sudo cat /var/lib/jenkins/secrets/initialAdminPassword
   ```
3. **Install suggested plugins**
4. **Create admin user**
5. **Configure Jenkins URL**

### 3. Configure Global Tools

Go to **Manage Jenkins > Global Tool Configuration**:

#### Node.js Configuration
- **Name**: `NodeJS-18`
- **Version**: `18.x`
- **Global npm packages**: `artillery eslint`

#### Docker Configuration
- **Name**: `Docker`
- **Installation**: Install automatically from docker.com

#### Git Configuration
- **Name**: `Git`
- **Path to Git executable**: `/usr/bin/git`

## Pipeline Configuration

### 1. Create New Pipeline Job

1. **New Item** > **Pipeline** > Name: `user-auth-app-pipeline`
2. **Pipeline Definition**: Pipeline script from SCM
3. **SCM**: Git
4. **Repository URL**: Your repository URL
5. **Branch**: `*/main` (or your default branch)
6. **Script Path**: `application/Jenkinsfile`

### 2. Environment Variables

Configure in **Pipeline > Environment Variables**:

```bash
# Docker Registry
DOCKER_REGISTRY=your-registry.com
IMAGE_NAME=user-auth-app
AWS_REGION=us-east-1

# Test Database
TEST_DB_HOST=localhost
TEST_DB_USER=testuser
TEST_DB_PASSWORD=testpass
TEST_DB_NAME=test_db
TEST_DB_PORT=5432

# Test Redis
TEST_REDIS_HOST=localhost
TEST_REDIS_PORT=6379
TEST_REDIS_PASSWORD=testredispass

# Test Application
TEST_JWT_SECRET=test-jwt-secret-key
TEST_SESSION_SECRET=test-session-secret-key
```

### 3. Credentials Setup

Go to **Manage Jenkins > Manage Credentials**:

#### Docker Registry Credentials
- **Kind**: Username with password
- **ID**: `docker-registry-creds`
- **Username**: Your registry username
- **Password**: Your registry password

#### AWS Credentials (if using AWS)
- **Kind**: AWS Credentials
- **ID**: `aws-creds`
- **Access Key ID**: Your AWS access key
- **Secret Access Key**: Your AWS secret key

#### Database Credentials
- **Kind**: Secret text
- **ID**: `test-db-password`
- **Secret**: Your test database password

## Database Setup for Testing

### PostgreSQL Test Database Setup

```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create test database and user
sudo -u postgres psql -c "CREATE DATABASE test_db;"
sudo -u postgres psql -c "CREATE USER testuser WITH ENCRYPTED PASSWORD 'testpass';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE test_db TO testuser;"
sudo -u postgres psql -c "ALTER USER testuser CREATEDB;"

# Test connection
PGPASSWORD=testpass psql -h localhost -U testuser -d test_db -c "SELECT version();"
```

### Redis Test Setup

```bash
# Install Redis
sudo apt install redis-server -y

# Configure Redis
sudo nano /etc/redis/redis.conf
# Add: requirepass testredispass

# Restart Redis
sudo systemctl restart redis-server

# Test connection
redis-cli -a testredispass ping
```

## Email Notification Setup

### 1. Configure Email in Jenkins

Go to **Manage Jenkins > Configure System > Extended E-mail Notification**:

```
SMTP Server: smtp.gmail.com
SMTP Port: 587
Use SMTP Authentication: Yes
Username: your-email@gmail.com
Password: your-app-password
Use SSL: Yes
```

### 2. Test Email Configuration

```bash
# Test email from Jenkins console
echo "Test email content" | mail -s "Jenkins Test" your-email@gmail.com
```

## Security Configuration

### 1. Jenkins Security Settings

Go to **Manage Jenkins > Configure Global Security**:

- **Security Realm**: Jenkins' own user database
- **Authorization**: Matrix-based security
- **Prevent Cross Site Request Forgery exploits**: Enabled

### 2. Pipeline Security

```groovy
// In Jenkinsfile, use credentials securely
withCredentials([usernamePassword(credentialsId: 'docker-registry-creds', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
    sh 'docker login -u $DOCKER_USER -p $DOCKER_PASS ${DOCKER_REGISTRY}'
}
```

## Multi-Branch Pipeline Setup

### 1. Create Multi-Branch Pipeline

1. **New Item** > **Multibranch Pipeline**
2. **Branch Sources**: Git
3. **Repository URL**: Your repository URL
4. **Scan Multibranch Pipeline Triggers**: Periodically if not otherwise run (1 minute)

### 2. Branch Strategy

```yaml
# Different behaviors for different branches
main:
  - Run all tests
  - Deploy to production (with approval)
  - Send notifications

develop:
  - Run all tests
  - Deploy to staging
  - Send notifications

feature/*:
  - Run unit and integration tests
  - No deployment
  - Send notifications on failure only
```

## Performance Monitoring

### 1. Pipeline Performance Metrics

- **Build Time**: Target < 15 minutes
- **Test Coverage**: Target > 80%
- **Security Scan**: 0 high/critical vulnerabilities
- **Performance Tests**: Response time < 500ms

### 2. Jenkins Performance Monitoring

```bash
# Monitor Jenkins performance
sudo systemctl status jenkins
sudo journalctl -u jenkins -f

# Check disk usage
df -h /var/lib/jenkins

# Monitor memory usage
free -h
top -p $(pgrep -f jenkins)
```

## Backup and Disaster Recovery

### 1. Jenkins Backup

```bash
# Backup Jenkins home directory
sudo tar -czf jenkins-backup-$(date +%Y%m%d).tar.gz -C /var/lib/jenkins .

# Backup to S3 (if using AWS)
aws s3 cp jenkins-backup-$(date +%Y%m%d).tar.gz s3://your-backup-bucket/jenkins-backups/
```

### 2. Restore Jenkins

```bash
# Stop Jenkins
sudo systemctl stop jenkins

# Restore from backup
sudo tar -xzf jenkins-backup-YYYYMMDD.tar.gz -C /var/lib/jenkins

# Fix permissions
sudo chown -R jenkins:jenkins /var/lib/jenkins

# Start Jenkins
sudo systemctl start jenkins
```

## Troubleshooting

### Common Issues

#### 1. Node.js Not Found
```bash
# Solution: Install Node.js globally
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### 2. Docker Permission Denied
```bash
# Solution: Add jenkins user to docker group
sudo usermod -a -G docker jenkins
sudo systemctl restart jenkins
```

#### 3. Database Connection Failed
```bash
# Solution: Check database status and credentials
sudo systemctl status postgresql
PGPASSWORD=testpass psql -h localhost -U testuser -d test_db -c "SELECT version();"
```

#### 4. Redis Connection Failed
```bash
# Solution: Check Redis status and password
sudo systemctl status redis-server
redis-cli -a testredispass ping
```

### Debug Commands

```bash
# Check Jenkins logs
sudo journalctl -u jenkins -f

# Check build workspace
ls -la /var/lib/jenkins/workspace/

# Test database connection
PGPASSWORD=testpass psql -h localhost -U testuser -d test_db -c "\\dt"

# Test Redis connection
redis-cli -a testredispass info replication
```

## Best Practices

### 1. Pipeline Best Practices

- **Use parallel stages** for independent operations
- **Cache dependencies** to speed up builds
- **Clean up resources** after each build
- **Use proper error handling**
- **Implement proper logging**

### 2. Security Best Practices

- **Use credentials binding** for sensitive data
- **Regularly update Jenkins and plugins**
- **Use HTTPS** for Jenkins access
- **Implement proper user permissions**
- **Regular security audits**

### 3. Performance Best Practices

- **Use build agents** for distributed builds
- **Implement build artifacts caching**
- **Optimize Docker image sizes**
- **Use proper resource limits**
- **Monitor build performance**

## Maintenance

### 1. Regular Maintenance Tasks

```bash
# Weekly tasks
- Update Jenkins plugins
- Clean old build artifacts
- Review pipeline performance
- Check disk space

# Monthly tasks
- Update Jenkins core
- Review security settings
- Backup configurations
- Update documentation
```

### 2. Plugin Management

```bash
# Update all plugins
curl -X POST http://localhost:8080/updateCenter/install -d "plugin=plugin-name"

# List installed plugins
curl -X GET http://localhost:8080/pluginManager/api/json?depth=1

# Restart Jenkins after updates
sudo systemctl restart jenkins
```

## Additional Resources

- [Jenkins Documentation](https://jenkins.io/doc/)
- [Pipeline Syntax Reference](https://jenkins.io/doc/book/pipeline/syntax/)
- [Docker Pipeline Plugin](https://plugins.jenkins.io/docker-workflow/)
- [Email Extension Plugin](https://plugins.jenkins.io/email-ext/)
- [Blue Ocean Documentation](https://jenkins.io/doc/book/blueocean/)

## Support

For issues and questions:
1. Check Jenkins logs first
2. Review pipeline console output
3. Consult Jenkins documentation
4. Contact your DevOps team
