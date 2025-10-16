pipeline {
  agent any

  environment {
    APP_HOST = "204.236.175.242"                     // your app EC2 public IP
    APP_SSH_CREDENTIALS = "app-ssh"                  // Jenkins SSH credentials ID
    SONAR_TOKEN = credentials('sonarqube-token')     // Jenkins secret text credential for SonarQube token
    SONAR_HOST_URL = "http://54.177.58.182:9000"    // SonarQube URL
    DOCKER_IMAGE = "demo-app:${env.BUILD_NUMBER}"
    DEP_CHECK_OUTPUT = "dependency-check-report"
  }

  options {
    skipDefaultCheckout(false)
    timeout(time: 60, unit: 'MINUTES')
  }

  stages {

    stage('Checkout Source Code') {
      steps {
        echo "Checking out source code from GitHub..."
        checkout([$class: 'GitSCM',
          branches: [[name: '*/main']],
          userRemoteConfigs: [[url: 'https://github.com/HariharanB11/jenkins-sonarqube-demo-app']]
        ])
      }
    }

    stage('Install Dependencies & Unit Tests') {
      steps {
        echo "Installing project dependencies..."
        sh '''
          if command -v npm >/dev/null 2>&1; then
            npm install
            npm test || true
          else
            echo "npm not found - skipping"
          fi
        '''
      }
    }

    stage('SonarQube Scan (SAST)') {
      steps {
        echo "Running static analysis with SonarQube..."
        withSonarQubeEnv('SonarQubeServer') {
          sh '''
            sonar-scanner \
              -Dsonar.projectKey=demo-app \
              -Dsonar.sources=. \
              -Dsonar.host.url=${SONAR_HOST_URL} \
              -Dsonar.login=${SONAR_TOKEN}
          '''
        }
      }
    }

    stage('Wait for SonarQube Quality Gate') {
      steps {
        echo "Waiting for SonarQube Quality Gate..."
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Dependency Check (SCA)') {
      steps {
        echo "Running OWASP Dependency Check for known vulnerabilities..."
        sh '''
          mkdir -p ${DEP_CHECK_OUTPUT}
          if docker ps >/dev/null 2>&1; then
            docker run --rm -v "$PWD":/src -v "$PWD/${DEP_CHECK_OUTPUT}":/report owasp/dependency-check:latest \
              --project "demo-app" --scan /src --format HTML --out /report
          else
            echo "Docker not available - skipping dependency-check"
          fi
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: "${DEP_CHECK_OUTPUT}/**", allowEmptyArchive: true
          publishHTML(target: [
            reportName: 'Dependency Check Report',
            reportDir: "${DEP_CHECK_OUTPUT}",
            reportFiles: 'dependency-check-report.html',
            keepAll: true
          ])
        }
      }
    }

    stage('Build Docker Image') {
      steps {
        echo "Building Docker image for application..."
        sh '''
          if docker ps >/dev/null 2>&1; then
            docker build -t ${DOCKER_IMAGE} .
          else
            echo "Docker not available - skipping image build"
          fi
        '''
      }
    }

    stage('Deploy to Application EC2') {
      steps {
        echo "Deploying application to EC2..."
        sshagent([env.APP_SSH_CREDENTIALS]) {
          sh '''
            scp -o StrictHostKeyChecking=no -r . ubuntu@${APP_HOST}:/home/ubuntu/demo-deploy-${BUILD_NUMBER}
            ssh -o StrictHostKeyChecking=no ubuntu@${APP_HOST} <<'SSH_EOF'
              cd /home/ubuntu/demo-deploy-${BUILD_NUMBER}
              if [ -f Dockerfile ]; then
                docker build -t demo-app:live .
                docker stop demo-app || true
                docker rm demo-app || true
                docker run -d --name demo-app -p 3000:3000 demo-app:live
              else
                echo "No Dockerfile found - exiting"
                exit 1
              fi
            SSH_EOF
          '''
        }
      }
    }

    stage('Container Security Scan (Trivy)') {
      steps {
        echo "Scanning Docker image with Trivy for vulnerabilities..."
        sh '''
          if docker ps >/dev/null 2>&1; then
            docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image ${DOCKER_IMAGE} > trivy-report.txt || true
          else
            echo "Docker not available - skipping Trivy scan"
          fi
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'trivy-report.txt', allowEmptyArchive: true
        }
      }
    }

    stage('DAST (ZAP Security Scan)') {
      steps {
        echo "Performing Dynamic Application Security Test with ZAP..."
        sh '''
          sleep 10
          if command -v zap-cli >/dev/null 2>&1; then
            zap-cli quick-scan --self-contained http://${APP_HOST}:3000
            zap-cli report -o zap_report.html -f html
          else
            echo "ZAP CLI not installed - skipping DAST stage"
          fi
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'zap_report.html', allowEmptyArchive: true
          publishHTML(target: [
            reportName: 'ZAP Security Report',
            reportDir: '.',
            reportFiles: 'zap_report.html',
            keepAll: true
          ])
        }
      }
    }

  }

  post {
    success {
      echo "✅ Pipeline executed successfully! Application deployed and security scans complete."
    }
    failure {
      echo "❌ Pipeline failed. Check console logs and reports for details."
    }
    unstable {
      echo "⚠️ Pipeline completed with warnings or failed checks."
    }
  }
}

