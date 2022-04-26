FROM node:17-buster

WORKDIR /app

COPY src ./src
COPY agent.yml ./agent.yml
COPY package.json ./package.json
COPY tsconfig.json ./tsconfig.json
COPY webpack.config.cjs ./webpack.config.cjs
COPY wrangler.toml ./wrangler.toml
COPY package-lock.json ./package-lock.json
COPY did-provider-cheqd/ ./did-provider-cheqd/

ENV NODE_OPTIONS=--openssl-legacy-provider
ENV KV_PERSIST=true

RUN npm install
RUN npm run build

ENTRYPOINT [ "npx", "miniflare", "/app/dist/worker.js", "--kv-persist", "${KV_PERSIST}" ]
