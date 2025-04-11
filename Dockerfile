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

# Set environment variables
ENV NODE_ENV=development
ENV SESSION_SECRET=dev-secret-change-this

# Set the command to run the development server
CMD ["npm", "run", "dev"]