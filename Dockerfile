# Production image: Express API + built React PWA on one port (Fly.io / Docker).

FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend-build
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/prisma ./prisma
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npx prisma generate && npm run build

FROM node:20-alpine AS production
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NODE_ENV=production
ENV SERVE_FRONTEND=true
ENV FRONTEND_DIST=/app/frontend/dist
ENV PORT=8080

COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/node_modules/.prisma ./node_modules/.prisma
COPY backend/prisma ./prisma
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

EXPOSE 8080
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
