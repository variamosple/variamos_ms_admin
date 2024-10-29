# FROM node:lts-bullseye-slim
FROM node:20-alpine

WORKDIR /variaMosAdminService
COPY ./tsconfig.prod.json ./tsconfig.prod.json
COPY ./tsconfig.json ./tsconfig.json
COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json
COPY ./build.ts ./build.ts
COPY ./src ./src
COPY ./env ./env

RUN npm install
RUN npm run build

EXPOSE 4000

CMD [ "npm", "start" ]

