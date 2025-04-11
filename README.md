# SLA Monitoring Tool

A modern enterprise SLA monitoring tool designed to track, analyze, and manage service level agreements with comprehensive performance insights and team collaboration features.

## Features

- Real-time SLA compliance tracking
- Team performance comparisons
- Historical performance analytics
- Automated alerts and issue tracking
- Microsoft Azure AD authentication (demo mode)

## Docker Setup for Development

This project includes Docker configuration for easy local development. Follow these steps to run the application in a container:

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)

### Running with Docker

1. **Build the Docker image**:

   ```bash
   docker build -t sla-monitoring-tool .
   ```

2. **Run the container**:

   ```bash
   docker run -p 5000:5000 -v $(pwd):/usr/src/app -v /usr/src/app/node_modules sla-monitoring-tool
   ```

   This will:
   - Start the container in development mode
   - Map port 5000 to your host machine
   - Mount your current directory as a volume for real-time code updates

3. **Access the application**:

   Open your browser and navigate to:
   ```
   http://localhost:5000
   ```

4. **Login with test credentials**:
   - Username: `azure_test_user`
   - Password: `Azure123!`

### Managing the Docker Container

- **View logs** (in a separate terminal window):
  ```bash
  docker logs -f $(docker ps -q --filter ancestor=sla-monitoring-tool)
  ```

- **Stop the container**:
  ```bash
  docker stop $(docker ps -q --filter ancestor=sla-monitoring-tool)
  ```

- **Rebuild the container** (after changing dependencies):
  ```bash
  docker build -t sla-monitoring-tool .
  ```

## Development Without Docker

If you prefer to run the application directly on your machine:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

## Environment Variables

The default Docker setup includes these environment variables:

- `SESSION_SECRET`: Secret key for session encryption (default: "dev-secret-change-this")
- `NODE_ENV`: Set to "development" for the development server

## Project Structure

- `/client`: React frontend code
- `/server`: Express backend code
- `/shared`: Shared type definitions and schemas

## Technologies Used

- Frontend: React, TypeScript, Material UI, Redux Toolkit
- Backend: Express.js, Passport.js
- Tools: Vite, Tailwind CSS, React Query