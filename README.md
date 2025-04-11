# SLA Monitoring Tool

A modern enterprise SLA monitoring tool designed to track, analyze, and manage service level agreements with comprehensive performance insights and team collaboration features.

## Features

- Real-time SLA compliance tracking
- Team performance comparisons
- Historical performance analytics
- Automated alerts and issue tracking
- Microsoft Azure AD authentication (demo mode)

## Docker Setup for Development

This project includes Docker configuration for easy local development. You can use either Docker Compose (recommended) or regular Docker commands.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/) (recommended)

### Option 1: Running with Docker Compose (Recommended)

1. **Start the application**:

   ```bash
   docker-compose up
   ```

   This will:
   - Build the Docker image if needed
   - Start the container in development mode
   - Map port 5000 to your host machine
   - Mount your local directories as volumes for real-time code updates

2. **Run in background mode** (optional):

   ```bash
   docker-compose up -d
   ```

3. **View logs**:

   ```bash
   docker-compose logs -f
   ```

4. **Stop the application**:

   ```bash
   docker-compose down
   ```

### Option 2: Running with Docker Commands

If you prefer to use Docker directly without Docker Compose:

1. **Build the Docker image**:

   ```bash
   docker build -t sla-monitoring-tool .
   ```

2. **Run the container**:

   ```bash
   docker run -p 5000:5000 \
     -v $(pwd)/client:/usr/src/app/client \
     -v $(pwd)/server:/usr/src/app/server \
     -v $(pwd)/shared:/usr/src/app/shared \
     -v /usr/src/app/node_modules \
     --name sla-app \
     sla-monitoring-tool
   ```

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
  docker logs -f sla-app
  ```

- **Stop the container**:
  ```bash
  docker stop sla-app
  ```

- **Restart the container**:
  ```bash
  docker restart sla-app
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