# syntax=docker/dockerfile:1

FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build

# Production image, copy all the files and run
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 facusito

COPY --from=builder --chown=facusito:nodejs /app/dist ./dist
COPY --from=builder --chown=facusito:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=facusito:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=facusito:nodejs /app/package.json ./package.json
COPY --from=builder --chown=facusito:nodejs /app/prisma ./prisma

USER facusito

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s CMD node -e "require('http').get('http://localhost:4000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/index.js"]
