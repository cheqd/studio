###############################################################
###         STAGE 1: Build credential-service app           ###
###############################################################

FROM node:16-alpine AS builder

# Set working directory & bash defaults
WORKDIR /home/node/app

# Copy source files
COPY . .

# Installing dependencies
RUN npm ci

# Build the app
RUN npm run build

###############################################################
###             STAGE 2: Build Miniflare runner             ###
###############################################################

FROM node:16-alpine AS runner

# Install pre-requisite packages
RUN apk update && apk add --no-cache bash

# Set working directory & bash defaults
WORKDIR /home/node/app

# Copy built application
COPY --chown=node:node --from=builder /home/node/app/dist/ dist

# Build-time arguments
ARG NPM_CONFIG_LOGLEVEL
ARG PORT=8787
ARG ISSUER_ID
ARG ISSUER_ID_KID
ARG ISSUER_ID_METHOD = "did:cheqd:mainnet:"
ARG ISSUER_ID_PUBLIC_KEY_HEX
ARG ISSUER_ID_PRIVATE_KEY_HEX
ARG ISSUER_ID_METHOD_SPECIFIC_ID
ARG COSMOS_PAYER_MNEMONIC
ARG NETWORK_RPC_URL = "https://rpc.cheqd.net"
ARG AUTH0_SERVICE_ENDPOINT

# Run-time environment variables
ENV NPM_CONFIG_LOGLEVEL ${NPM_CONFIG_LOGLEVEL}
ENV PORT ${PORT}
ENV ISSUER_ID ISSUER_ID ${ISSUER_ID}
ENV ISSUER_ID_KID ${ISSUER_ID_KID}
ENV ISSUER_ID_METHOD ${ISSUER_ID_METHOD}
ENV ISSUER_ID_PUBLIC_KEY_HEX ${ISSUER_ID_PUBLIC_KEY_HEX}
ENV ISSUER_ID_PRIVATE_KEY_HEX ${ISSUER_ID_PRIVATE_KEY_HEX}
ENV ISSUER_ID_METHOD_SPECIFIC_ID ${ISSUER_ID_METHOD_SPECIFIC_ID}
ENV COSMOS_PAYER_MNEMONIC ${COSMOS_PAYER_MNEMONIC}
ENV AUTH0_SERVICE_ENDPOINT ${AUTH0_SERVICE_ENDPOINT}

# We install Miniflare because we don't have the node_modules directory
# this image only has the output worker.js file.
RUN npm install -g miniflare@2.9.0

# Specify default port
EXPOSE ${PORT}

# Set user and shell
USER node
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

# Run the application
CMD [ "miniflare", "dist/worker.js" ]
