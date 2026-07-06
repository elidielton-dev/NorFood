FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

RUN mkdir -p /data/auth
VOLUME ["/data/auth"]

ENV WHATSAPP_AUTH_DIR=/data/auth
ENV WHATSAPP_GATEWAY_PORT=8090

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8090/health || exit 1

CMD ["node", "dist/index.js"]
