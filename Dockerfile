# FROM node:lts-bullseye-slim
FROM node:24-alpine

WORKDIR /variaMosAdminService
COPY ./tsconfig.prod.json ./tsconfig.prod.json
COPY ./tsconfig.json ./tsconfig.json
COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json
COPY ./build.ts ./build.ts
COPY ./src ./src

RUN npm install
RUN npm run build

# Set after the build, which needs the development dependencies; the
# variables come from the container, never from a file in the image (EV-69)
ENV NODE_ENV=production

EXPOSE 4000

CMD [ "npm", "start" ]

