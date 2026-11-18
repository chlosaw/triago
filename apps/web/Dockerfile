# Build context is the repo root (see docker-compose.yml).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace packages/shared --workspace apps/web
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace packages/shared && npm run build --workspace apps/web

FROM nginx:1.27-alpine
# Defaults suit docker compose; a host such as Railway overrides them (it sets PORT itself).
# API_UPSTREAM: host:port of the API. TRUSTED_PROXY_CIDR: the edge proxy in front of nginx, if any.
ENV PORT=80 \
    API_UPSTREAM=api:3001 \
    TRUSTED_PROXY_CIDR=127.0.0.1/32 \
    NGINX_ENVSUBST_FILTER="^(PORT|API_UPSTREAM|TRUSTED_PROXY_CIDR)$"
# The image renders /etc/nginx/templates/*.template into conf.d at start-up.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
