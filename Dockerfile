###############################################################
###         STAGE 1: Build credential-service app           ###
###############################################################

FROM node:18-alpine AS builder

# Set working directory & bash defaults
WORKDIR /home/node/app

# Copy source files
COPY . .

# Installing dependencies
RUN npm ci

ARG ISSUER_DATABASE_URL
ENV ISSUER_DATABASE_URL ${ISSUER_DATABASE_URL}

# create migrations
RUN npm run migration

# Build the app
RUN npm run build

###############################################################
###             STAGE 2: Build runner             ###
###############################################################

FROM node:18-alpine AS runner

# Set working directory & bash defaults
WORKDIR /home/node/app

# Copy built application
COPY --from=builder /home/node/app/dist .

# Build-time arguments
ARG NODE_ENV=production
ARG NPM_CONFIG_LOGLEVEL=warn
ARG PORT=8787
ARG ISSUER_SECRET_KEY
ARG ISSUER_DATABASE_SYNCHRONIZE
ARG ISSUER_DATABASE_URL
ARG MAINNET_RPC_URL
ARG TESTNET_RPC_URL
ARG RESOLVER_URL
ARG ALLOWED_ORIGINS

# Run-time environment variables
ENV NODE_ENV ${NODE_ENV}
ENV NPM_CONFIG_LOGLEVEL ${NPM_CONFIG_LOGLEVEL}
ENV PORT ${PORT}
ENV ISSUER_SECRET_KEY ${ISSUER_SECRET_KEY}
ENV ISSUER_DATABASE_URL ${ISSUER_DATABASE_URL}
ENV MAINNET_RPC_URL ${MAINNET_RPC_URL}
ENV TESTNET_RPC_URL ${TESTNET_RPC_URL}
ENV RESOLVER_URL ${RESOLVER_URL}
ENV ALLOWED_ORIGINS ${ALLOWED_ORIGINS}

# We don't have the node_modules directory
# this image only has the output worker.js file.
# Install pre-requisites
RUN npm install swagger-ui-express@4.5.0 && \
    chown -R node:node /home/node/app && \
    apk update && \
    apk add --no-cache bash ca-certificates python3 build-base gcc g++ postgresql-dev

RUN npm i pg-native

# Specify default port
EXPOSE ${PORT}

# Set user and shell
USER node
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

# Run the application
CMD [ "node", "index.js" ]
