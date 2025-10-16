pipeline {
  agent any
  environment {
    APP_HOST = "204.236.175.242"        // replace
    APP_SSH_CREDENTIALS = "app-ssh"                // Jenkins credentials id created earlier
    SONAR_TOKEN = credentials('sonar-token')       // Jenkins secret text id
    SONAR_HOST_URL = "http://54.177.58.182:9000"  // replace with your Sonar URL
    DOCKER_IMAGE = "demo-app:${env.BUILD_NUMBER}"
    DEP_CHECK_OUTPUT = "dependency-check-report"
    ZAP_API_URL = "http://54.177.58.182:8080"     // If ZAP daemon runs on Jenkins host, replace accordingly
  }

  options {
    skipDefaultCheckout(false)
    timeout(time: 60, unit: 'MINUTES')
  }

  stages {

    stage('Checkout') {
      steps {
        checkout([$class: 'GitSCM', branches: [[name: '*/main']], userRemoteConfigs: [[url: 'https://github.com/HariharanB11/jenkins-sonarqube-demo-app', credentialsId: 'github-creds']]])
      }
    }

    stage('Install deps & Unit tests') {
      steps {
        sh 'npm install'
        // run your unit tests here if you have them
        sh 'npm test || true'
      }
    }

    stage('SonarQube Scan (SAST)') {
      steps {
        withEnv(["SONAR_HOST_URL=${env.SONAR_HOST_URL}", "SONAR_TOKEN=${SONAR_TOKEN}"]) {
          // Use Docker scanner if Jenkins host can run docker
          sh '''
            if docker ps >/dev/null 2>&1; then
              docker run --rm -v "$PWD":/usr/src -e SONAR_HOST_URL=${SONAR_HOST_URL} -e SONAR_LOGIN=${SONAR_TOKEN} sonarsource/sonar-scanner-cli \
                -Dsonar.projectKey=demo-app -Dsonar.sources=/usr/src -Dsonar.host.url=${SONAR_HOST_URL} -Dsonar.login=${SONAR_TOKEN}
            else
              echo "Docker not available on agent - attempting local sonar-scanner"
              sonar-scanner -Dsonar.projectKey=demo-app -Dsonar.sources=. -Dsonar.host.url=${SONAR_HOST_URL} -Dsonar.login=${SONAR_TOKEN}
            fi
          '''
        }
      }
    }

    stage('Wait SonarQube Quality Gate') {
      steps {
        // This uses the SonarQube Jenkins plugin's waitForQualityGate step
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Dependency Check (SCA)') {
      steps {
        sh '''
        mkdir -p ${DEP_CHECK_OUTPUT}
        # Run OWASP dependency-check using docker image (should pull automatically)
        if docker ps >/dev/null 2>&1; then
          docker run --rm -v "$PWD":/src -v "$PWD/${DEP_CHECK_OUTPUT}":/report owasp/dependency-check:latest \
            --project "demo-app" --scan /src --format HTML --out /report
        else
          echo "Docker not available - skipping dependency-check (install CLI or enable docker on agent)"
        fi
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: "${DEP_CHECK_OUTPUT}/**", allowEmptyArchive: true
          publishHTML (target: [reportName: 'Dependency-Check Report', reportDir: "${DEP_CHECK_OUTPUT}", reportFiles: 'dependency-check-report.html', keepAll: true])
        }
      }
    }

    stage('Build Docker image') {
      steps {
        sh '''
        if docker ps >/dev/null 2>&1; then
          docker build -t ${DOCKER_IMAGE} .
        else
          echo "Docker not available - packaging source to transfer for remote build"
        fi
        '''
      }
    }

    stage('Deploy to App EC2') {
      steps {
        sshagent([env.APP_SSH_CREDENTIALS]) {
          // copy source and build remotely and run container on APP_HOST
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
              echo "No Dockerfile found - exit 1"
              exit 1
            fi
          SSH_EOF
          '''
        }
      }
    }

    stage('DAST: OWASP ZAP (dynamic scan)') {
      steps {
        // this assumes ZAP daemon is running reachable at ZAP_API_URL on the Jenkins host
        sh '''
        # Wait a moment for the app to be fully up
        sleep 10
        # Run quick scan using zap-cli (if available)
        if command -v zap-cli >/dev/null 2>&1; then
          zap-cli --zap-url ${ZAP_API_URL} --port 8080 quick-scan http://${APP_HOST}:3000
          zap-cli --zap-url ${ZAP_API_URL} --port 8080 report -o zap_report.html -f html
        else
          # Fallback: use curl to trigger ZAP API (requires ZAP automation or scripts on ZAP host)
          echo "zap-cli not available on agent. Try to call remote script on Jenkins host that triggers scan."
        fi
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'zap_report.html', allowEmptyArchive: true
          publishHTML (target: [reportName: 'ZAP Report', reportDir: '.', reportFiles: 'zap_report.html', keepAll: true])
        }
      }
    }

  } // stages

  post {
    success {
      echo "Pipeline completed successfully."
    }
    unstable {
      echo "Pipeline completed but unstable — checks may have failed."
    }
    failure {
      echo "Pipeline failed. Check the console output and reports."
    }
  }
}

