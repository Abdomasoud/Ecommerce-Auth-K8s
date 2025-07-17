pipeline {
    agent any
    
    environment {
        NODE_VERSION = '18'
        DOCKER_REGISTRY = 'your-registry.com'
        IMAGE_NAME = 'user-auth-app'
        AWS_REGION = 'us-east-1'
        
        // Test Database Configuration
        TEST_DB_HOST = 'localhost'
        TEST_DB_USER = 'testuser'
        TEST_DB_PASSWORD = 'testpass'
        TEST_DB_NAME = 'test_db'
        TEST_DB_PORT = '5432'
        
        // Test Redis Configuration
        TEST_REDIS_HOST = 'localhost'
        TEST_REDIS_PORT = '6379'
        TEST_REDIS_PASSWORD = 'testredispass'
        
        // Test Application Configuration
        TEST_JWT_SECRET = 'test-jwt-secret-key'
        TEST_SESSION_SECRET = 'test-session-secret-key'
    }
    
    stages {
        stage('Checkout') {
            steps {
                script {
                    echo "Checking out code from ${env.BRANCH_NAME}"
                    checkout scm
                }
            }
        }
        
        stage('Setup Environment') {
            steps {
                script {
                    echo "Setting up Node.js ${NODE_VERSION}"
                    
                    // Install Node.js
                    sh '''
                        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
                        sudo apt-get install -y nodejs
                        node --version
                        npm --version
                    '''
                    
                    // Install application dependencies
                    dir('application') {
                        sh '''
                            npm cache clean --force
                            npm install
                        '''
                    }
                }
            }
        }
        
        stage('Setup Test Infrastructure') {
            parallel {
                stage('Setup Test Database') {
                    steps {
                        script {
                            echo "Setting up test PostgreSQL database"
                            sh '''
                                # Start PostgreSQL service
                                sudo systemctl start postgresql
                                
                                # Create test database and user
                                sudo -u postgres psql -c "CREATE DATABASE ${TEST_DB_NAME};"
                                sudo -u postgres psql -c "CREATE USER ${TEST_DB_USER} WITH ENCRYPTED PASSWORD '${TEST_DB_PASSWORD}';"
                                sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${TEST_DB_NAME} TO ${TEST_DB_USER};"
                                sudo -u postgres psql -c "ALTER USER ${TEST_DB_USER} CREATEDB;"
                                
                                # Import schema
                                PGPASSWORD=${TEST_DB_PASSWORD} psql -h ${TEST_DB_HOST} -U ${TEST_DB_USER} -d ${TEST_DB_NAME} -f application/database/schema.sql
                            '''
                        }
                    }
                }
                
                stage('Setup Test Redis') {
                    steps {
                        script {
                            echo "Setting up test Redis"
                            sh '''
                                # Install and start Redis
                                sudo apt-get update
                                sudo apt-get install -y redis-server
                                sudo systemctl start redis-server
                                
                                # Configure Redis for testing
                                echo "requirepass ${TEST_REDIS_PASSWORD}" | sudo tee -a /etc/redis/redis.conf
                                sudo systemctl restart redis-server
                                
                                # Test Redis connection
                                redis-cli -a ${TEST_REDIS_PASSWORD} ping
                            '''
                        }
                    }
                }
            }
        }
        
        stage('Code Quality Checks') {
            parallel {
                stage('Lint Check') {
                    steps {
                        dir('application') {
                            script {
                                echo "Running ESLint checks"
                                sh '''
                                    npx eslint . --ext .js --format junit --output-file eslint-results.xml || true
                                    npx eslint . --ext .js --format table || true
                                '''
                            }
                        }
                    }
                    post {
                        always {
                            publishTestResults testResultsPattern: 'application/eslint-results.xml'
                        }
                    }
                }
                
                stage('Security Audit') {
                    steps {
                        dir('application') {
                            script {
                                echo "Running security audit"
                                sh '''
                                    npm audit --audit-level=moderate --json > npm-audit-results.json || true
                                    npm audit --audit-level=moderate || true
                                '''
                            }
                        }
                    }
                    post {
                        always {
                            archiveArtifacts artifacts: 'application/npm-audit-results.json', allowEmptyArchive: true
                        }
                    }
                }
            }
        }
        
        stage('Unit Tests') {
            steps {
                dir('application') {
                    script {
                        echo "Running unit tests"
                        sh '''
                            export NODE_ENV=test
                            export USE_SECRETS_MANAGER=false
                            export DB_HOST=${TEST_DB_HOST}
                            export DB_USER=${TEST_DB_USER}
                            export DB_PASSWORD=${TEST_DB_PASSWORD}
                            export DB_NAME=${TEST_DB_NAME}
                            export DB_PORT=${TEST_DB_PORT}
                            export REDIS_HOST=${TEST_REDIS_HOST}
                            export REDIS_PORT=${TEST_REDIS_PORT}
                            export REDIS_PASSWORD=${TEST_REDIS_PASSWORD}
                            export JWT_SECRET=${TEST_JWT_SECRET}
                            export SESSION_SECRET=${TEST_SESSION_SECRET}
                            
                            npm run test:unit
                        '''
                    }
                }
            }
            post {
                always {
                    publishTestResults testResultsPattern: 'application/test-results.xml'
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'application/coverage',
                        reportFiles: 'index.html',
                        reportName: 'Unit Test Coverage Report'
                    ])
                }
            }
        }
        
        stage('Integration Tests') {
            steps {
                dir('application') {
                    script {
                        echo "Running integration tests"
                        sh '''
                            export NODE_ENV=test
                            export USE_SECRETS_MANAGER=false
                            export DB_HOST=${TEST_DB_HOST}
                            export DB_USER=${TEST_DB_USER}
                            export DB_PASSWORD=${TEST_DB_PASSWORD}
                            export DB_NAME=${TEST_DB_NAME}
                            export DB_PORT=${TEST_DB_PORT}
                            export REDIS_HOST=${TEST_REDIS_HOST}
                            export REDIS_PORT=${TEST_REDIS_PORT}
                            export REDIS_PASSWORD=${TEST_REDIS_PASSWORD}
                            export JWT_SECRET=${TEST_JWT_SECRET}
                            export SESSION_SECRET=${TEST_SESSION_SECRET}
                            
                            # Clean test database before integration tests
                            PGPASSWORD=${TEST_DB_PASSWORD} psql -h ${TEST_DB_HOST} -U ${TEST_DB_USER} -d ${TEST_DB_NAME} -c "
                                TRUNCATE TABLE order_items, orders, user_profiles, users, products RESTART IDENTITY CASCADE;
                            "
                            
                            npm run test:integration
                        '''
                    }
                }
            }
            post {
                always {
                    publishTestResults testResultsPattern: 'application/integration-test-results.xml'
                }
            }
        }
        
        stage('End-to-End Tests') {
            steps {
                dir('application') {
                    script {
                        echo "Running end-to-end tests"
                        sh '''
                            export NODE_ENV=test
                            export USE_SECRETS_MANAGER=false
                            export DB_HOST=${TEST_DB_HOST}
                            export DB_USER=${TEST_DB_USER}
                            export DB_PASSWORD=${TEST_DB_PASSWORD}
                            export DB_NAME=${TEST_DB_NAME}
                            export DB_PORT=${TEST_DB_PORT}
                            export REDIS_HOST=${TEST_REDIS_HOST}
                            export REDIS_PORT=${TEST_REDIS_PORT}
                            export REDIS_PASSWORD=${TEST_REDIS_PASSWORD}
                            export JWT_SECRET=${TEST_JWT_SECRET}
                            export SESSION_SECRET=${TEST_SESSION_SECRET}
                            
                            # Clean test database before e2e tests
                            PGPASSWORD=${TEST_DB_PASSWORD} psql -h ${TEST_DB_HOST} -U ${TEST_DB_USER} -d ${TEST_DB_NAME} -c "
                                TRUNCATE TABLE order_items, orders, user_profiles, users, products RESTART IDENTITY CASCADE;
                            "
                            
                            npm run test:e2e
                        '''
                    }
                }
            }
            post {
                always {
                    publishTestResults testResultsPattern: 'application/e2e-test-results.xml'
                }
            }
        }
        
        stage('Test Coverage Report') {
            steps {
                dir('application') {
                    script {
                        echo "Generating comprehensive test coverage report"
                        sh '''
                            export NODE_ENV=test
                            export USE_SECRETS_MANAGER=false
                            export DB_HOST=${TEST_DB_HOST}
                            export DB_USER=${TEST_DB_USER}
                            export DB_PASSWORD=${TEST_DB_PASSWORD}
                            export DB_NAME=${TEST_DB_NAME}
                            export DB_PORT=${TEST_DB_PORT}
                            export REDIS_HOST=${TEST_REDIS_HOST}
                            export REDIS_PORT=${TEST_REDIS_PORT}
                            export REDIS_PASSWORD=${TEST_REDIS_PASSWORD}
                            export JWT_SECRET=${TEST_JWT_SECRET}
                            export SESSION_SECRET=${TEST_SESSION_SECRET}
                            
                            npm run test:coverage
                        '''
                    }
                }
            }
            post {
                always {
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'application/coverage',
                        reportFiles: 'index.html',
                        reportName: 'Full Test Coverage Report'
                    ])
                }
            }
        }
        
        stage('Build Docker Image') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                    branch 'release/*'
                }
            }
            steps {
                dir('application') {
                    script {
                        echo "Building Docker image"
                        def imageTag = "${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(7)}"
                        def fullImageName = "${DOCKER_REGISTRY}/${IMAGE_NAME}:${imageTag}"
                        
                        sh """
                            docker build -t ${fullImageName} .
                            docker tag ${fullImageName} ${DOCKER_REGISTRY}/${IMAGE_NAME}:latest
                        """
                        
                        env.DOCKER_IMAGE_TAG = imageTag
                        env.DOCKER_IMAGE_FULL_NAME = fullImageName
                    }
                }
            }
        }
        
        stage('Security Scan') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                    branch 'release/*'
                }
            }
            steps {
                script {
                    echo "Running security scan on Docker image"
                    sh """
                        # Install Trivy if not already installed
                        if ! command -v trivy &> /dev/null; then
                            sudo apt-get update
                            sudo apt-get install wget apt-transport-https gnupg lsb-release -y
                            wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
                            echo "deb https://aquasecurity.github.io/trivy-repo/deb \\$(lsb_release -sc) main" | sudo tee -a /etc/apt/sources.list.d/trivy.list
                            sudo apt-get update
                            sudo apt-get install trivy -y
                        fi
                        
                        # Scan the Docker image
                        trivy image --format json --output trivy-results.json ${env.DOCKER_IMAGE_FULL_NAME} || true
                        trivy image --format table ${env.DOCKER_IMAGE_FULL_NAME} || true
                    """
                }
            }
            post {
                always {
                    archiveArtifacts artifacts: 'trivy-results.json', allowEmptyArchive: true
                }
            }
        }
        
        stage('Performance Tests') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                dir('application') {
                    script {
                        echo "Running performance tests"
                        sh '''
                            # Install Artillery if not installed
                            if ! command -v artillery &> /dev/null; then
                                npm install -g artillery
                            fi
                            
                            # Start the application in background
                            export NODE_ENV=test
                            export USE_SECRETS_MANAGER=false
                            export DB_HOST=${TEST_DB_HOST}
                            export DB_USER=${TEST_DB_USER}
                            export DB_PASSWORD=${TEST_DB_PASSWORD}
                            export DB_NAME=${TEST_DB_NAME}
                            export DB_PORT=${TEST_DB_PORT}
                            export REDIS_HOST=${TEST_REDIS_HOST}
                            export REDIS_PORT=${TEST_REDIS_PORT}
                            export REDIS_PASSWORD=${TEST_REDIS_PASSWORD}
                            export JWT_SECRET=${TEST_JWT_SECRET}
                            export SESSION_SECRET=${TEST_SESSION_SECRET}
                            export PORT=3002
                            
                            npm start &
                            APP_PID=$!
                            
                            # Wait for app to start
                            sleep 10
                            
                            # Run basic performance test
                            artillery quick --duration 60 --rate 10 --output perf-results.json http://localhost:3002/ || true
                            
                            # Stop the application
                            kill $APP_PID || true
                        '''
                    }
                }
            }
            post {
                always {
                    archiveArtifacts artifacts: 'application/perf-results.json', allowEmptyArchive: true
                }
            }
        }
        
        stage('Deploy to Staging') {
            when {
                branch 'develop'
            }
            steps {
                script {
                    echo "Deploying to staging environment"
                    sh """
                        # Push Docker image to registry
                        docker push ${env.DOCKER_IMAGE_FULL_NAME}
                        docker push ${DOCKER_REGISTRY}/${IMAGE_NAME}:latest
                        
                        # Deploy to staging (this would typically use your deployment tool)
                        echo "Deploying image ${env.DOCKER_IMAGE_FULL_NAME} to staging"
                        
                        # Example: Update ECS service, Kubernetes deployment, etc.
                        # aws ecs update-service --cluster staging-cluster --service user-auth-app --force-new-deployment
                    """
                }
            }
        }
        
        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo "Deploying to production environment"
                    
                    // Add approval step for production deployment
                    input message: 'Deploy to production?', ok: 'Deploy',
                          parameters: [choice(name: 'ENVIRONMENT', choices: ['production'], description: 'Target environment')]
                    
                    sh """
                        # Push Docker image to registry
                        docker push ${env.DOCKER_IMAGE_FULL_NAME}
                        docker push ${DOCKER_REGISTRY}/${IMAGE_NAME}:latest
                        
                        # Deploy to production
                        echo "Deploying image ${env.DOCKER_IMAGE_FULL_NAME} to production"
                        
                        # Example: Update ECS service, Kubernetes deployment, etc.
                        # aws ecs update-service --cluster production-cluster --service user-auth-app --force-new-deployment
                    """
                }
            }
        }
    }
    
    post {
        always {
            script {
                echo "Cleaning up test environment"
                
                // Clean up test database
                sh '''
                    PGPASSWORD=${TEST_DB_PASSWORD} psql -h ${TEST_DB_HOST} -U ${TEST_DB_USER} -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB_NAME};" || true
                    sudo -u postgres psql -c "DROP USER IF EXISTS ${TEST_DB_USER};" || true
                ''' 
                
                // Clean up Redis
                sh '''
                    redis-cli -a ${TEST_REDIS_PASSWORD} flushall || true
                '''
                
                // Clean up Docker images
                sh '''
                    docker image prune -f || true
                '''
            }
        }
        
        success {
            script {
                echo "Pipeline completed successfully!"
                
                // Send success notification
                emailext (
                    subject: "✅ Build Success: ${env.JOB_NAME} - ${env.BUILD_NUMBER}",
                    body: """
                        <h2>Build Successful!</h2>
                        <p><strong>Job:</strong> ${env.JOB_NAME}</p>
                        <p><strong>Build Number:</strong> ${env.BUILD_NUMBER}</p>
                        <p><strong>Branch:</strong> ${env.BRANCH_NAME}</p>
                        <p><strong>Commit:</strong> ${env.GIT_COMMIT}</p>
                        <p><strong>Build URL:</strong> <a href='${env.BUILD_URL}'>${env.BUILD_URL}</a></p>
                        
                        <h3>Test Results:</h3>
                        <ul>
                            <li>Unit Tests: ✅ Passed</li>
                            <li>Integration Tests: ✅ Passed</li>
                            <li>End-to-End Tests: ✅ Passed</li>
                            <li>Security Scan: ✅ Completed</li>
                            <li>Performance Tests: ✅ Completed</li>
                        </ul>
                    """,
                    to: "${env.CHANGE_AUTHOR_EMAIL}",
                    mimeType: 'text/html'
                )
            }
        }
        
        failure {
            script {
                echo "Pipeline failed!"
                
                // Send failure notification
                emailext (
                    subject: "❌ Build Failed: ${env.JOB_NAME} - ${env.BUILD_NUMBER}",
                    body: """
                        <h2>Build Failed!</h2>
                        <p><strong>Job:</strong> ${env.JOB_NAME}</p>
                        <p><strong>Build Number:</strong> ${env.BUILD_NUMBER}</p>
                        <p><strong>Branch:</strong> ${env.BRANCH_NAME}</p>
                        <p><strong>Commit:</strong> ${env.GIT_COMMIT}</p>
                        <p><strong>Build URL:</strong> <a href='${env.BUILD_URL}'>${env.BUILD_URL}</a></p>
                        
                        <h3>Failure Details:</h3>
                        <p>Please check the build logs for more details.</p>
                        
                        <h3>Console Output:</h3>
                        <pre>${env.BUILD_LOG}</pre>
                    """,
                    to: "${env.CHANGE_AUTHOR_EMAIL}",
                    mimeType: 'text/html'
                )
            }
        }
        
        unstable {
            script {
                echo "Pipeline completed with warnings!"
                
                // Send unstable notification
                emailext (
                    subject: "⚠️ Build Unstable: ${env.JOB_NAME} - ${env.BUILD_NUMBER}",
                    body: """
                        <h2>Build Unstable!</h2>
                        <p><strong>Job:</strong> ${env.JOB_NAME}</p>
                        <p><strong>Build Number:</strong> ${env.BUILD_NUMBER}</p>
                        <p><strong>Branch:</strong> ${env.BRANCH_NAME}</p>
                        <p><strong>Commit:</strong> ${env.GIT_COMMIT}</p>
                        <p><strong>Build URL:</strong> <a href='${env.BUILD_URL}'>${env.BUILD_URL}</a></p>
                        
                        <h3>Warning Details:</h3>
                        <p>Some tests may have failed or there are other issues. Please review the build logs.</p>
                    """,
                    to: "${env.CHANGE_AUTHOR_EMAIL}",
                    mimeType: 'text/html'
                )
            }
        }
    }
}
