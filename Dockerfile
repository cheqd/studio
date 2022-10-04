FROM node:18.10.0-alpine3.16 as builder

WORKDIR /app

ENV NODE_OPTIONS=--openssl-legacy-provider

COPY . .

RUN npm install && npm run build

FROM node:18.10.0-alpine3.16

WORKDIR /app

ARG USER="cheqd"
RUN addgroup --system ${USER} && \
	adduser ${USER} --system --shell /bin/bash && \
	npm install --location=global miniflare && \
    apk add bash --no-cache && \
    chown -R cheqd:cheqd /app

COPY --from=builder --chown=cheqd:cheqd /app/dist/worker.js worker.js
COPY --chown=cheqd:cheqd scripts/entrypoint.sh scripts/write-envs-to-file.sh .

USER ${USER}
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

EXPOSE 8787

ENTRYPOINT ["sh", "entrypoint.sh"]
