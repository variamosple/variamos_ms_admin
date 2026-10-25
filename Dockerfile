# Build stage: the development dependencies compile the code, then leave
FROM node:24-alpine AS build

WORKDIR /variaMosAdminService
# Dependencies first: a change of the source code reuses this layer
COPY ./package.json ./package-lock.json ./
RUN npm ci

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

EXPOSE 4000

CMD [ "npm", "start" ]
