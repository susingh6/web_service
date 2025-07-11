# Multi-stage build for SLA Management Tool
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S sla-app -u 1001

# Copy built application
COPY --from=builder --chown=sla-app:nodejs /app/dist ./dist
COPY --from=builder --chown=sla-app:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=sla-app:nodejs /app/package*.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Switch to non-root user
USER sla-app

# Expose port
EXPOSE 3000

# Start application with proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server/index.js"]