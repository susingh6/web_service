# SLA Monitoring Tool

A modern enterprise SLA monitoring tool designed to track, analyze, and manage service level agreements with comprehensive performance insights and team collaboration features.

## Features

- Real-time SLA compliance tracking
- Team performance comparisons
- Historical performance analytics
- Automated alerts and issue tracking
- Microsoft Azure AD authentication (demo mode)

## Docker Setup

This project includes Docker configuration for easy deployment. Follow these steps to run the application in a container:

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop)

### Running with Docker

1. **Build and start the container**:

   ```bash
   docker-compose up -d
   ```

   This will:
   - Build the Docker image using the Dockerfile
   - Start the container in detached mode
   - Map port 5000 to your host machine

2. **Access the application**:

   Open your browser and navigate to:
   ```
   http://localhost:5000
   ```

3. **Login with test credentials**:
   - Username: `azure_test_user`
   - Password: `Azure123!`

### Managing the Docker Container

- **View logs**:
  ```bash
  docker-compose logs -f
  ```

- **Stop the container**:
  ```bash
  docker-compose down
  ```

- **Rebuild the container** (after code changes):
  ```bash
  docker-compose up -d --build
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

3. **Build for production**:
   ```bash
   npm run build
   ```

4. **Run in production mode**:
   ```bash
   npm start
   ```

## Environment Variables

You can customize the application by setting these environment variables:

- `SESSION_SECRET`: Secret key for session encryption (default in Docker: "your-secret-key-change-this-in-production")
- `NODE_ENV`: Set to "production" for production mode or "development" for development

## Project Structure

- `/client`: React frontend code
- `/server`: Express backend code
- `/shared`: Shared type definitions and schemas

## Technologies Used

- Frontend: React, TypeScript, Material UI, Redux Toolkit
- Backend: Express.js, Passport.js
- Tools: Vite, Tailwind CSS, React Query