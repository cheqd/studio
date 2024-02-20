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
ARG ENABLE_EXTERNAL_DB=false
ARG EXTERNAL_DB_CONNECTION_URL
ARG EXTERNAL_DB_ENCRYPTION_KEY
ARG EXTERNAL_DB_CERT

#  LogTo: build-time
ARG ENABLE_AUTHENTICATION=false
ARG LOGTO_ENDPOINT
ARG LOGTO_DEFAULT_RESOURCE_URL
ARG LOGTO_APP_ID
ARG LOGTO_APP_SECRET
ARG CORS_ALLOWED_ORIGINS
ARG COOKIE_SECRET
ARG LOGTO_M2M_APP_ID
ARG LOGTO_M2M_APP_SECRET
ARG LOGTO_MANAGEMENT_API
ARG LOGTO_DEFAULT_ROLE_ID
ARG LOGTO_WEBHOOK_SECRET
ARG ENABLE_DATADOG=false
ARG LOG_LEVEL=info

# Verida connector: build-time
ARG ENABLE_VERIDA_CONNECTOR=false
ARG VERIDA_NETWORK=testnet
ARG POLYGON_RPC_URL=https://rpc-mumbai.maticvigil.com
ARG VERIDA_PRIVATE_KEY
ARG POLYGON_PRIVATE_KEY
ARG ENABLE_ACCOUNT_TOPUP=false
ARG FAUCET_URI=https://faucet-api.cheqd.network/credit
ARG TESTNET_MINIMUM_BALANCE=1000

# Environment variables: base configuration
ENV NPM_CONFIG_LOGLEVEL ${NPM_CONFIG_LOGLEVEL}
ENV PORT ${PORT}

# Environment variables: network API endpoints
ENV MAINNET_RPC_URL ${MAINNET_RPC_URL}
ENV TESTNET_RPC_URL ${TESTNET_RPC_URL}
ENV RESOLVER_URL ${RESOLVER_URL}
ENV APPLICATION_BASE_URL ${APPLICATION_BASE_URL}

# Environment variables: Veramo Database configuration
ENV ENABLE_EXTERNAL_DB ${ENABLE_EXTERNAL_DB}
ENV EXTERNAL_DB_CONNECTION_URL ${EXTERNAL_DB_CONNECTION_URL}
ENV EXTERNAL_DB_ENCRYPTION_KEY ${EXTERNAL_DB_ENCRYPTION_KEY}
ENV EXTERNAL_DB_CERT ${EXTERNAL_DB_CERT}

# Environment variables: LogTo
ENV ENABLE_AUTHENTICATION ${ENABLE_AUTHENTICATION}
ENV LOGTO_ENDPOINT ${LOGTO_ENDPOINT}
ENV LOGTO_DEFAULT_RESOURCE_URL ${LOGTO_DEFAULT_RESOURCE_URL}
ENV LOGTO_APP_ID ${LOGTO_APP_ID}
ENV LOGTO_APP_SECRET ${LOGTO_APP_SECRET}
ENV CORS_ALLOWED_ORIGINS ${CORS_ALLOWED_ORIGINS}
ENV COOKIE_SECRET ${COOKIE_SECRET}
ENV LOGTO_M2M_APP_ID ${LOGTO_M2M_APP_ID}
ENV LOGTO_M2M_APP_SECRET ${LOGTO_M2M_APP_SECRET}
ENV LOGTO_MANAGEMENT_API ${LOGTO_MANAGEMENT_API}
ENV LOGTO_DEFAULT_ROLE_ID ${LOGTO_DEFAULT_ROLE_ID}
ENV LOGTO_WEBHOOK_SECRET ${LOGTO_WEBHOOK_SECRET}
ENV ENABLE_DATADOG ${ENABLE_DATADOG}
ENV LOG_LEVEL ${LOG_LEVEL}

# Faucet setup
ENV ENABLE_ACCOUNT_TOPUP ${ENABLE_ACCOUNT_TOPUP}
ENV FAUCET_URI ${FAUCET_URI}
ENV TESTNET_MINIMUM_BALANCE ${TESTNET_MINIMUM_BALANCE}

# Environment variables: Verida connector
ENV ENABLE_VERIDA_CONNECTOR ${ENABLE_VERIDA_CONNECTOR}
ENV VERIDA_NETWORK ${VERIDA_NETWORK}
ENV POLYGON_RPC_URL ${POLYGON_RPC_URL}
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
