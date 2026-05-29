FROM node:20-alpine

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source (plain Node ESM — no build step)
COPY src ./src

ENV NODE_ENV=production
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3003/health').then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))"

# Start server
CMD ["node", "src/server.js"]
