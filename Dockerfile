# ==============================================================================
# CloudScale Microservice - Production Dockerfile
# ==============================================================================
# Base Image: Official Node.js 20 Alpine Linux image
# - Minimal attack surface and footprint (< 180MB)
# - Security-hardened Linux distribution
# ==============================================================================
FROM node:20-alpine

# Metadata labels adhering to OCI (Open Container Initiative) standards
LABEL maintainer="Chran19" \
      project="CloudScale-Microservice" \
      version="1.0.0" \
      description="Production container for CloudScale Node.js microservice"

# Define environment variables
# NODE_ENV=production optimizes Node.js runtime and disables verbose debug overhead
ENV NODE_ENV=production \
    PORT=3000

# Set the working directory inside the container
WORKDIR /usr/src/app

# Leverage Docker layer caching: Copy dependency manifests first
# Layers before this will remain cached if dependencies have not changed
COPY package*.json ./

# Install only production dependencies (or clean install)
# If no external packages are present, npm will verify package integrity
RUN npm install --omit=dev --no-audit --no-fund

# Copy the rest of the application source code into the container
# Ensure non-root user permissions
COPY . .

# Security Best Practice: Run application as non-root user
# Node image comes pre-configured with a 'node' user (UID/GID 1000)
USER node

# Expose the application listening port (documentation for Docker and Kubernetes)
EXPOSE 3000

# Healthcheck instruction to allow Docker daemon and Kubernetes to monitor container health
# Uses native Node.js HTTP call (does not require external tools like curl or wget in Alpine)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/healthz', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Launch the microservice using executive array syntax (ensures PID 1 receives SIGTERM signals)
CMD ["node", "server.js"]
