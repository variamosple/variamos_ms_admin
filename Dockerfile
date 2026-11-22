# Build stage: the development dependencies compile the code, then leave
FROM node:26-alpine AS build

WORKDIR /variaMosAdminService
# Dependencies first: a change of the source code reuses this layer
COPY ./package.json ./package-lock.json ./
# No lifecycle script of the dependencies runs; bcrypt ships its prebuilt
# binaries, musl included
RUN npm ci --ignore-scripts

COPY ./tsconfig.prod.json ./tsconfig.json ./build.ts ./
COPY ./src ./src
RUN npm run build && npm prune --omit=dev

# Run stage: the compiled code and the production dependencies only (T-30)
FROM node:26-alpine

WORKDIR /variaMosAdminService
COPY --from=build /variaMosAdminService/package.json ./package.json
COPY --from=build /variaMosAdminService/node_modules ./node_modules
COPY --from=build /variaMosAdminService/dist ./dist

# The variables come from the container, never from a file in the image (EV-69)
ENV NODE_ENV=production

# Not root (EV-71 lot 5): Docker is reached through the socket proxy, and the
# JWT key and the uploads directory are readable and writable by uid 1000. The
# server mounts its own uploads directory over this one
RUN mkdir -p dist/public/uploads && chown node:node dist/public/uploads
USER node

EXPOSE 4000

# Health of the container, seen by Docker and by "docker compose up --wait"
# (SPC-2026-11-18-001, lot A2). /health also checks the database
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD ["sh", "-c", "wget -q -O /dev/null http://127.0.0.1:${PORT:-4000}/health"]


# node itself, not npm: as process 1 it gets the SIGTERM of docker stop and
# shuts down cleanly (ADM-N21). The same command as the "start" script of
# package.json, which a test keeps equal
CMD ["node", "--env-file-if-exists=env/production.env", "./dist/index.js", "--env=production"]
