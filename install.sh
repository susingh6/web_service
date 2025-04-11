#!/bin/bash

# SLA Monitoring Tool Installation Script
echo "Starting SLA Monitoring Tool installation..."

# Check if Docker is installed
if command -v docker &> /dev/null; then
  echo "Docker is installed."
  
  # Build Docker image
  echo "Building Docker image..."
  docker build -t sla-monitoring-tool .
  
  if [ $? -eq 0 ]; then
    # Run the container
    echo "Starting Docker container..."
    docker run -d -p 5000:5000 \
      -v "$(pwd):/usr/src/app" \
      -v /usr/src/app/node_modules \
      --name sla-monitoring-tool-container \
      sla-monitoring-tool
    
    if [ $? -eq 0 ]; then
      echo "Docker container is running successfully!"
      echo ""
      echo "You can access the SLA Monitoring Tool at: http://localhost:5000"
      echo "Login with these credentials:"
      echo "  Username: azure_test_user"
      echo "  Password: Azure123!"
      echo ""
      echo "To view logs: docker logs -f sla-monitoring-tool-container"
      echo "To stop the container: docker stop sla-monitoring-tool-container"
    else
      echo "Failed to start Docker container. Please check the error messages above."
    fi
  else
    echo "Failed to build Docker image. Please check the error messages above."
  fi
else
  echo "Docker is not installed."
  echo "Please install Docker first."
  echo "Visit https://docs.docker.com/get-docker/ for installation instructions."
fi