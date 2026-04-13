FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY server ./server
COPY src ./src
COPY tsconfig.json tsconfig.server.json tsconfig.node.json ./

ENV NODE_ENV=production
ENV API_PORT=8080

EXPOSE 8080

CMD ["npm", "run", "start:api"]
