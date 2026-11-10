# syntax=docker/dockerfile:1
# ---- build
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Optional corporate proxy CA: docker build --secret id=npm_ca,src=/path/ca.pem (no effect when absent)
RUN --mount=type=secret,id=npm_ca,required=false sh -c '[ -f /run/secrets/npm_ca ] && export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; npm ci --no-audit --no-fund'
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

# ---- runtime (production dependencies only, non-root)
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npm_ca,required=false sh -c '[ -f /run/secrets/npm_ca ] && export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; npm ci --omit=dev --no-audit --no-fund' && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
RUN mkdir -p /data/files && chown -R node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "dist/src/server.js"]
