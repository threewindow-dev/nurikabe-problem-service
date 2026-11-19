FROM node:22-alpine AS build

WORKDIR /app

COPY packages/core/package.json packages/core/package-lock.json ./packages/core/
COPY packages/storage/package.json packages/storage/package-lock.json ./packages/storage/
COPY apps/web/package.json apps/web/package-lock.json ./apps/web/

RUN npm ci --prefix packages/core \
    && npm ci --prefix packages/storage \
    && npm ci --prefix apps/web

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN npm --prefix packages/core run build \
    && npm --prefix apps/web run build

FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
