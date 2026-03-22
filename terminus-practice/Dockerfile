# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy all source
COPY . .

# Install dependencies (ignoring scripts during install to avoid native build issues until build stage)
RUN npm install --prefer-offline --no-audit

# Build
RUN npm run build

# Stage 2: Runtime
FROM alpine:3.20

RUN apk add --no-cache nodejs npm dumb-init nginx

WORKDIR /app

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Static frontend
RUN mkdir -p /usr/share/nginx/html
COPY --from=builder /app/frontend/web/dist /usr/share/nginx/html

# Backend built files
COPY --from=builder /app/backend/server/dist ./backend/server/dist

# Copy package files for production install
COPY package*.json ./
COPY backend/server/package*.json ./backend/server/
COPY frontend/web/package*.json ./frontend/web/

# Install production dependencies
RUN npm install --prefer-offline --no-audit --omit=dev

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 80

# Entrypoint
RUN echo '#!/bin/sh\nnginx\nnode backend/server/dist/index.js' > /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/entrypoint.sh"]
