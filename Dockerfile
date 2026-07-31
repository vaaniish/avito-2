# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS node-base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM node-base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/prisma ./backend/prisma
COPY prisma.config.ts ./prisma.config.ts
RUN npm ci

FROM dependencies AS backend-build
COPY backend ./backend
COPY tsconfig.json ./tsconfig.json
RUN npm run build:backend

FROM dependencies AS frontend-build
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
COPY frontend ./frontend
COPY tsconfig.json ./tsconfig.json
RUN npm run build:frontend

FROM node-base AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node-base AS backend
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=backend-build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=backend-build /app/dist/backend ./dist/backend
COPY backend/data/seed-media ./backend/data/seed-media
COPY package.json ./package.json
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:3001/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/backend/src/server.js"]

FROM dependencies AS migrate
COPY backend ./backend
COPY prisma.config.ts ./prisma.config.ts
CMD ["npm", "run", "db:migrate:deploy"]

FROM nginx:1.27-alpine AS frontend
COPY infra/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=frontend-build /app/dist/frontend /usr/share/nginx/html
EXPOSE 8080
