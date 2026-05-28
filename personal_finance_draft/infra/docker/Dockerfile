FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production \
    SOVEREIGN_WEB_HOST=0.0.0.0 \
    SOVEREIGN_WEB_PORT=8787

COPY package*.json ./
COPY web ./web
COPY web_page ./web_page
COPY scripts ./scripts
COPY docs ./docs
COPY test ./test
COPY data ./data
COPY workspace ./workspace
COPY cpp_core ./cpp_core

RUN npm install --omit=dev

EXPOSE 8787

CMD ["node", "web/app.js"]
