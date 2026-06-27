# Build multi-stage — NorFood VPS (Nitro node-server)

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

FROM deps AS build
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_DEMO_MODE=false
ARG VITE_PLATFORM_ADMIN_EMAILS
ARG VITE_MP_PUBLIC_KEY
ARG VITE_EXPO_GO_URL
ARG VITE_EXPO_METRO_HOST
ARG VITE_EXPO_METRO_PORT
ENV NITRO_PRESET=node-server
ENV NODE_OPTIONS=--max-old-space-size=6144
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE
ENV VITE_PLATFORM_ADMIN_EMAILS=$VITE_PLATFORM_ADMIN_EMAILS
ENV VITE_MP_PUBLIC_KEY=$VITE_MP_PUBLIC_KEY
ENV VITE_EXPO_GO_URL=$VITE_EXPO_GO_URL
ENV VITE_EXPO_METRO_HOST=$VITE_EXPO_METRO_HOST
ENV VITE_EXPO_METRO_PORT=$VITE_EXPO_METRO_PORT
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

RUN apt-get update && apt-get install -y --no-install-recommends curl tini \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pm2@5

COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /app/.output ./.output
COPY --from=build /app/public ./public
COPY deploy/ecosystem.config.cjs ./deploy/ecosystem.config.cjs
COPY deploy/start.sh ./deploy/start.sh
RUN chmod +x deploy/start.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["./deploy/start.sh"]
