# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json vite.config.ts ./
COPY components.json* bunfig.toml* eslint.config.js* ./
COPY public ./public
COPY src ./src
ARG VITE_API_BASE_URL=http://localhost:4005
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# Stage 2: runtime
FROM node:20-alpine AS runtime
RUN apk add --no-cache dumb-init
WORKDIR /app
COPY prod-server.mjs ./
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
ENV PORT=3006
EXPOSE 3006
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "prod-server.mjs"]
