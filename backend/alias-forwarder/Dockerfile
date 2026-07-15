# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY drizzle.config.ts drizzle.config.js* ./
COPY src ./src
RUN npm run build

# Stage 2: runtime
FROM node:20-alpine AS runtime
RUN apk add --no-cache dumb-init
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
COPY drizzle ./drizzle
ENV NODE_ENV=production
EXPOSE 4005
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
