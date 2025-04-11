#!/bin/bash

# SLA Monitoring Tool Installation Script
echo "Starting SLA Monitoring Tool installation..."

# Create data directory if it doesn't exist
mkdir -p data

# Create .env file with default values
if [ ! -f .env ]; then
  echo "Creating default .env file..."
  cat > .env << EOL
SESSION_SECRET=your-secret-key-change-this-in-production
NODE_ENV=production
EOL
  echo ".env file created with default values."
fi

# Check if Docker is installed
if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
  echo "Docker and Docker Compose are installed."
  
  # Build and start the Docker container
  echo "Building and starting Docker container..."
  docker-compose up -d --build
  
  if [ $? -eq 0 ]; then
    echo "Docker container is running successfully!"
    echo ""
    echo "You can access the SLA Monitoring Tool at: http://localhost:5000"
    echo "Login with these credentials:"
    echo "  Username: azure_test_user"
    echo "  Password: Azure123!"
    echo ""
    echo "To view logs: docker-compose logs -f"
    echo "To stop the container: docker-compose down"
  else
    echo "Failed to start Docker container. Please check the error messages above."
  fi
else
  echo "Docker and/or Docker Compose are not installed."
  echo "Please install Docker and Docker Compose first."
  echo "Visit https://docs.docker.com/get-docker/ for installation instructions."
fi