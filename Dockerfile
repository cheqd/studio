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

# Build the app
RUN npm run build

###############################################################
###             STAGE 2: Build Miniflare runner             ###
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
ARG ISSUER_ID
ARG ISSUER_ID_KID
ARG ISSUER_ID_METHOD
ARG ISSUER_ID_PUBLIC_KEY_HEX
ARG ISSUER_ID_PRIVATE_KEY_HEX
ARG ISSUER_ID_METHOD_SPECIFIC_ID
ARG COSMOS_PAYER_MNEMONIC
ARG NETWORK_RPC_URL
ARG AUTH0_SERVICE_ENDPOINT
ARG RESOLVER_URL="https://resolver.cheqd.net/1.0/identifiers"

# Run-time environment variables
ENV NODE_ENV ${NODE_ENV}
ENV NPM_CONFIG_LOGLEVEL ${NPM_CONFIG_LOGLEVEL}
ENV PORT ${PORT}
ENV ISSUER_ID ISSUER_ID ${ISSUER_ID}
ENV ISSUER_ID_KID ${ISSUER_ID_KID}
ENV ISSUER_ID_METHOD ${ISSUER_ID_METHOD}
ENV ISSUER_ID_PUBLIC_KEY_HEX ${ISSUER_ID_PUBLIC_KEY_HEX}
ENV ISSUER_ID_PRIVATE_KEY_HEX ${ISSUER_ID_PRIVATE_KEY_HEX}
ENV ISSUER_ID_METHOD_SPECIFIC_ID ${ISSUER_ID_METHOD_SPECIFIC_ID}
ENV COSMOS_PAYER_MNEMONIC ${COSMOS_PAYER_MNEMONIC}
ENV NETWORK_RPC_URL ${NETWORK_RPC_URL}
ENV AUTH0_SERVICE_ENDPOINT ${AUTH0_SERVICE_ENDPOINT}
ENV RESOLVER_URL ${RESOLVER_URL}

# We don't have the node_modules directory
# this image only has the output worker.js file.
RUN chown -R node:node /home/node/app && \
    apk update && \
    apk add --no-cache bash ca-certificates

# Specify default port
EXPOSE ${PORT}

# Set user and shell
USER node
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

# Run the application
CMD [ "node", "index.js" ]
