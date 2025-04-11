FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Expose the port the app runs on
EXPOSE 5000

# Set environment variables for development
ENV NODE_ENV=development
ENV SESSION_SECRET=dev-secret-change-this
ENV VITE_APP_ENV=development
ENV VITE_API_TIMEOUT=30000
ENV VITE_ENABLE_TEAM_COMPARISONS=true
ENV VITE_ENABLE_HISTORY_TRACKING=true
ENV VITE_ENABLE_AZURE_AUTH=false
ENV VITE_DEFAULT_LOGIN_TYPE=local
ENV VITE_DEBUG=true
ENV VITE_SHOW_EXPERIMENTAL=true

# Install development dependencies
RUN npm install --only=development

# Set the command to run the development server
CMD ["npm", "run", "dev"]