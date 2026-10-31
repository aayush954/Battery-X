FROM node:20-alpine

WORKDIR /app

# Prisma requires OpenSSL on Alpine.
RUN apk add --no-cache openssl libc6-compat

# Install backend dependencies first for better Docker layer caching.
COPY backend/package*.json ./
RUN npm install

# Copy backend source, Prisma schema, and the updated frontend.
COPY backend/ ./
COPY public/ ./public/

RUN npx prisma generate

EXPOSE 5173

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm run prisma:seed && node src/server.js"]
