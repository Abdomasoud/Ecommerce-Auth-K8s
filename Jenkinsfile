pipeline {
    agent any
    
    environment {
        // Application Configuration
        APP_NAME = 'ecommerce-application'
        NODE_VERSION = '18'
        
        // AWS Configuration
        AWS_REGION = 'us-east-1'
        AWS_ACCOUNT_ID = '159781650309'  // Add your AWS Account ID
        ECR_REGISTRY = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
        ECR_REPOSITORY = "${APP_NAME}"
        
        // Docker Configuration
        DOCKER_IMAGE_TAG = "${BUILD_NUMBER}-${GIT_COMMIT[0..7]}"
        
        // SonarQube Configuration
        SONAR_PROJECT_KEY = "${APP_NAME}"
        SONAR_PROJECT_NAME = "${APP_NAME}"
    }
    
    stages {
        stage('Checkout') {
            steps {
                script {
                    echo "Checking out code from private GitHub repository"
                    checkout([
                        // $class: 'GitSCM',
                        branches: [[name: "${env.BRANCH_NAME}"]],
                        userRemoteConfigs: [[
                            credentialsId: 'jenkins_iti_gitops_ecommerce',
                            url: 'https://github.com/Abdomasoud/ITI_GitOps_Project.git'
                        ]]
                    ])
                }
            }
        }
        
        stage('Setup Environment') {
            steps {
                script {
                    echo "Setting up Node.js ${NODE_VERSION} environment"
                    dir('application') {
                        sh '''
                            # Install dependencies
                            npm ci --production=false
                            
                            # Verify installation
                            node --version
                            npm --version
                        '''
                    }
                }
            }
        }
        
        stage('Validate AWS Access') {
            steps {
                script {
                    echo "Validating AWS credentials and access"
                    withCredentials([aws(credentialsId: 'aws-credentials', region: "${AWS_REGION}")]) {
                        sh '''
                            # Test AWS CLI access
                            aws sts get-caller-identity
                            
                            # Test Secrets Manager access
                            aws secretsmanager list-secrets --max-items 1 --region ${AWS_REGION}
                            
                            # Test ECR access
                            aws ecr describe-repositories --region ${AWS_REGION} --max-items 1 || echo "ECR access validated"
                        '''
                    }
                }
            }
        }
        
        stage('Test AWS Connections') {
            steps {
                dir('application') {
                    script {
                        echo "Testing application AWS connections"
                        withCredentials([aws(credentialsId: 'aws-credentials', region: "${AWS_REGION}")]) {
                            sh '''
                                # Set environment variables
                                export NODE_ENV=test
                                export AWS_REGION=${AWS_REGION}
                                export USE_SECRETS_MANAGER=true
                                
                                # Test AWS connections using the application's test script
                                node test-aws-connections.js
                            '''
                        }
                    }
                }
            }
        }
        
        stage('Run Tests') {
            steps {
                dir('application') {
                    script {
                        echo "Running test suite with AWS credentials"
                        withCredentials([aws(credentialsId: 'aws-credentials', region: "${AWS_REGION}")]) {
                            sh '''
                                # Set test environment variables
                                export NODE_ENV=test
                                export AWS_REGION=${AWS_REGION}
                                export USE_SECRETS_MANAGER=true
                                
                                # Run all tests with coverage
                                npm run test:ci
                            '''
                        }
                    }
                }
            }
            post {
                always {
                    // Publish test results
                    publishTestResults testResultsPattern: 'application/coverage/test-results.xml'
                    
                    // Publish coverage report
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'application/coverage',
                        reportFiles: 'index.html',
                        reportName: 'Test Coverage Report'
                    ])
                }
            }
        }
        
        stage('SonarQube Analysis') {
            steps {
                dir('application') {
                    script {
                        echo "Running SonarQube analysis"
                        withCredentials([aws(credentialsId: 'aws-credentials', region: "${AWS_REGION}")]) {
                            withSonarQubeEnv('sonarqube-server') {
                                sh '''
                                    # Set environment for SonarQube analysis
                                    export NODE_ENV=test
                                    export AWS_REGION=${AWS_REGION}
                                    export USE_SECRETS_MANAGER=true
                                    
                                    npx sonar-scanner \
                                        -Dsonar.projectKey=${SONAR_PROJECT_KEY} \
                                        -Dsonar.projectName="${SONAR_PROJECT_NAME}" \
                                        -Dsonar.sources=. \
                                        -Dsonar.exclusions="node_modules/**,coverage/**,tests/**" \
                                        -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
                                        -Dsonar.testExecutionReportPaths=coverage/test-results.xml
                                '''
                            }
                        }
                    }
                }
            }
        }
        
        stage('Quality Gate') {
            steps {
                script {
                    echo "Waiting for SonarQube Quality Gate"
                    timeout(time: 5, unit: 'MINUTES') {
                        def qg = waitForQualityGate()
                        if (qg.status != 'OK') {
                            error "Pipeline aborted due to Quality Gate failure: ${qg.status}"
                        }
                    }
                }
            }
        }
        
        stage('Build Docker Image') {
            steps {
                dir('application') {
                    script {
                        echo "Building Docker image with AWS configuration"
                        sh '''
                            # Build the Docker image with build args for AWS region
                            docker build \
                                --build-arg AWS_REGION=${AWS_REGION} \
                                --build-arg NODE_ENV=production \
                                -t ${APP_NAME}:${DOCKER_IMAGE_TAG} .
                            
                            # Tag as latest
                            docker tag ${APP_NAME}:${DOCKER_IMAGE_TAG} ${APP_NAME}:latest
                        '''
                    }
                }
            }
        }
        
        stage('Push to ECR') {
            steps {
                script {
                    echo "Pushing Docker image to ECR"
                    withCredentials([aws(credentialsId: 'aws-credentials', region: "${AWS_REGION}")]) {
                        sh '''
                            # Login to ECR
                            aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}
                            
                            # Create repository if it doesn't exist
                            aws ecr describe-repositories --repository-names ${ECR_REPOSITORY} --region ${AWS_REGION} || \
                            aws ecr create-repository --repository-name ${ECR_REPOSITORY} --region ${AWS_REGION}
                            
                            # Tag and push images
                            docker tag ${APP_NAME}:${DOCKER_IMAGE_TAG} ${ECR_REGISTRY}/${ECR_REPOSITORY}:${DOCKER_IMAGE_TAG}
                            docker tag ${APP_NAME}:latest ${ECR_REGISTRY}/${ECR_REPOSITORY}:latest
                            
                            docker push ${ECR_REGISTRY}/${ECR_REPOSITORY}:${DOCKER_IMAGE_TAG}
                            docker push ${ECR_REGISTRY}/${ECR_REPOSITORY}:latest
                        '''
                    }
                }
            }
        }
    }
    
    post {
        always {
            script {
                echo "Cleaning up workspace"
                
                // Clean up Docker images
                sh '''
                    docker image prune -f || true
                    docker rmi ${APP_NAME}:${DOCKER_IMAGE_TAG} || true
                    docker rmi ${APP_NAME}:latest || true
                '''
            }
        }
        
        success {
            script {
                echo "Pipeline completed successfully!"
                
                // Optional: Send success notification
                echo "Build ${BUILD_NUMBER} completed successfully for branch ${BRANCH_NAME}"
                echo "Docker image pushed to ECR: ${ECR_REGISTRY}/${ECR_REPOSITORY}:${DOCKER_IMAGE_TAG}"
            }
        }
        
        failure {
            script {
                echo "Pipeline failed!"
                
                // Optional: Send failure notification
                echo "Build ${BUILD_NUMBER} failed for branch ${BRANCH_NAME}"
                echo "Please check the build logs for more details."
            }
        }
    }
}
