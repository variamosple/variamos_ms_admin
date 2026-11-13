# Build stage: the development dependencies compile the code, then leave
FROM node:24-alpine AS build

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
FROM node:24-alpine

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

CMD [ "npm", "start" ]
