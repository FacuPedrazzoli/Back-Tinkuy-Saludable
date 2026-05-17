# ===========================================
# Dockerfile - Backend (Apollo Server)
# ===========================================
# Multi-stage build for minimal image size
# Optimized for Dokploy deployment

# ─── Stage 1: Dependencies ───
FROM node:20-alpine AS deps
WORKDIR /app

# Install all dependencies (including dev for prisma generate)
COPY package.json package-lock.json* ./
RUN npm ci --only=production --ignore-scripts

# ─── Stage 2: Builder ───
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# ─── Stage 3: Runner (Minimal Image) ───
FROM node:20-alpine AS runner
WORKDIR /app

# Security: Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 api

# Set production environment
ENV NODE_ENV=production
ENV PORT=4000

# Create necessary directories
RUN mkdir -p /app/uploads /app/logs

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# Copy email templates
COPY --from=builder /app/src/emails ./src/emails

# Install dumb-init for proper signal handling (must run as root, before USER)
RUN apk add --no-cache dumb-init

# Use non-root user
USER api

# Expose port
EXPOSE 4000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Start with dumb-init for proper signal handling
CMD ["dumb-init", "node", "dist/index.js"]
