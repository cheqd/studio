FROM node:16-alpine as builder

WORKDIR /app

COPY . .

RUN npm ci && npm run build

FROM node:16-alpine

WORKDIR /app

COPY --from=builder --chown=node:node /app/dist/worker.js worker.js
COPY --chown=node:node scripts/entrypoint.sh scripts/write-envs-to-file.sh .

RUN npm install --location=global miniflare && \
    apk add bash --no-cache && \
    chown -R node:node /app

USER node
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]


EXPOSE 8787
ENTRYPOINT ["sh", "entrypoint.sh"]
