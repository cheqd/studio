###############################################################
###         STAGE 1: Build credential-service app           ###
###############################################################

FROM node:18-alpine AS builder

# Set working directory
WORKDIR /home/node/app

# Copy source
COPY . .

# Installing dependencies
RUN npm ci

# Build the app
RUN npm run build


###############################################################
###         STAGE 2: Build credential-service runner        ###
###############################################################

FROM node:18-alpine AS runner

# Set Node.js environment
ENV NODE_ENV=production

# Set working directory
WORKDIR /home/node/app

# Install pre-requisites
RUN apk update && \
    apk add --no-cache bash ca-certificates

# Copy files from builder
COPY --from=builder --chown=node:node /home/node/app/*.json /home/node/app/*.md ./
COPY --from=builder --chown=node:node /home/node/app/dist ./dist

# Install production dependencies
RUN npm ci

# Base arguments: build-time
ARG NPM_CONFIG_LOGLEVEL=warn
ARG PORT=3000

# Network API endpoints: build-time
ARG MAINNET_RPC_URL=https://rpc.cheqd.net:443
ARG TESTNET_RPC_URL=https://rpc.cheqd.network:443
ARG RESOLVER_URL=https://resolver.cheqd.net/1.0/identifiers/

# Veramo Database configuration: build-time
ARG DB_CONNECTION_URL
ARG DB_ENCRYPTION_KEY
ARG DB_CERTIFICATE

#  LogTo: build-time
ARG ENABLE_AUTH=false
ARG CUSTOMER_ID
ARG ALLOWED_ORIGINS
ARG OIDC_JWKS_ENDPOINT
ARG AUDIENCE_ENDPOINT
ARG OIDC_ISSUER

# Verida connector: build-time
ARG USE_VERIDA_CONNECTOR=false
ARG VERIDA_NETWORK=testnet
ARG VERIDA_PRIVATE_KEY
ARG POLYGON_PRIVATE_KEY

# Environment variables: base configuration
ENV NPM_CONFIG_LOGLEVEL ${NPM_CONFIG_LOGLEVEL}
ENV PORT ${PORT}

# Environment variables: network API endpoints
ENV MAINNET_RPC_URL ${MAINNET_RPC_URL}
ENV TESTNET_RPC_URL ${TESTNET_RPC_URL}
ENV RESOLVER_URL ${RESOLVER_URL}

# Environment variables: Veramo Database configuration
ENV DB_CONNECTION_URL ${DB_CONNECTION_URL}
ENV DB_ENCRYPTION_KEY ${DB_ENCRYPTION_KEY}
ENV DB_CERTIFICATE ${DB_CERTIFICATE}

# Environment variables: LogTo
ENV ENABLE_AUTH ${ENABLE_AUTH}
ENV CUSTOMER_ID ${CUSTOMER_ID}
ENV ALLOWED_ORIGINS ${ALLOWED_ORIGINS}
ENV OIDC_JWKS_ENDPOINT ${OIDC_JWKS_ENDPOINT}
ENV AUDIENCE_ENDPOINT ${AUDIENCE_ENDPOINT}
ENV OIDC_ISSUER ${OIDC_ISSUER}

# Environment variables: Verida connector
ENV USE_VERIDA_CONNECTOR ${USE_VERIDA_CONNECTOR}
ENV VERIDA_NETWORK ${VERIDA_NETWORK}
ENV VERIDA_PRIVATE_KEY ${VERIDA_PRIVATE_KEY}
ENV POLYGON_PRIVATE_KEY ${POLYGON_PRIVATE_KEY}

# Set ownership permissions
RUN chown -R node:node /home/node/app

# Specify default port
EXPOSE ${PORT}

# Set user and shell
USER node
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

# Run the application
CMD ["npm", "start"]
