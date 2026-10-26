###############################################################
###         STAGE 1: Build cheqd studio app                 ###
###############################################################

FROM node:22.23.4-alpine3.23 AS builder

# Set working directory
WORKDIR /home/node/app

# Copy source
COPY . .

# Installing dependencies
RUN npm ci --force

# Build the app
RUN npm run build


###############################################################
###         STAGE 2: Build cheqd studio runner              ###
###############################################################

FROM node:22.23.4-alpine3.23 AS runner

# Set Node.js environment
ENV NODE_ENV=production

# Set working directory
WORKDIR /home/node/app

# Install pre-requisites
RUN apk add --no-cache --upgrade bash ca-certificates && \
    update-ca-certificates

# Copy files from builder
COPY --from=builder --chown=node:node /home/node/app/*.json /home/node/app/*.md ./
COPY --from=builder --chown=node:node /home/node/app/dist ./dist
# Dependency patches, applied by the postinstall script during npm ci
COPY --from=builder --chown=node:node /home/node/app/patches ./patches

# Install production dependencies
RUN npm ci --force

# Base arguments: build-time
ARG NPM_CONFIG_LOGLEVEL=warn
ARG PORT=3000

# Network API endpoints: build-time
ARG MAINNET_RPC_URL=https://rpc.cheqd.net:443
ARG TESTNET_RPC_URL=https://rpc.cheqd.network:443
ARG RESOLVER_URL=https://resolver.cheqd.net/1.0/identifiers/

# Veramo Database configuration: build-time
ARG ENABLE_EXTERNAL_DB=false

#  LogTo: build-time
ARG ENABLE_AUTHENTICATION=false
ARG LOGTO_ENDPOINT
ARG LOGTO_DEFAULT_RESOURCE_URL
ARG LOGTO_APP_ID
ARG CORS_ALLOWED_ORIGINS
ARG LOGTO_M2M_APP_ID
ARG LOGTO_MANAGEMENT_API
ARG LOGTO_TESTNET_ROLE_ID
ARG LOGTO_DEFAULT_ROLE_ID
ARG LOGTO_MAINNET_ROLE_ID
ARG LOG_LEVEL=info

# API generation
ARG API_KEY_EXPIRATION=30

# Verida connector: build-time
ARG ENABLE_VERIDA_CONNECTOR=false
ARG POLYGON_RPC_URL=https://rpc.ankr.com/polygon_mumbai
ARG ENABLE_ACCOUNT_TOPUP=false
ARG FAUCET_URI=https://faucet-api.cheqd.network/credit
ARG TESTNET_MINIMUM_BALANCE=10000
ARG FAUCET_ACCESS_CLIENT_ID

# Stripe
ARG STRIPE_ENABLED=false
ARG STRIPE_PUBLISHABLE_KEY
ARG STRIPE_BUILD_PLAN_ID
ARG STRIPE_TEST_PLAN_ID

# Environment variables: base configuration
ENV NPM_CONFIG_LOGLEVEL=${NPM_CONFIG_LOGLEVEL}
ENV PORT=${PORT}

# Environment variables: network API endpoints
ENV MAINNET_RPC_URL=${MAINNET_RPC_URL}
ENV TESTNET_RPC_URL=${TESTNET_RPC_URL}
ENV RESOLVER_URL=${RESOLVER_URL}
ENV APPLICATION_BASE_URL=${APPLICATION_BASE_URL}

# Environment variables: Veramo Database configuration
ENV ENABLE_EXTERNAL_DB=${ENABLE_EXTERNAL_DB}

# Environment variables: LogTo
ENV ENABLE_AUTHENTICATION=${ENABLE_AUTHENTICATION}
ENV LOGTO_ENDPOINT=${LOGTO_ENDPOINT}
ENV LOGTO_DEFAULT_RESOURCE_URL=${LOGTO_DEFAULT_RESOURCE_URL}
ENV LOGTO_APP_ID=${LOGTO_APP_ID}
ENV CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS}
ENV LOGTO_M2M_APP_ID=${LOGTO_M2M_APP_ID}
ENV LOGTO_MANAGEMENT_API=${LOGTO_MANAGEMENT_API}
ENV LOGTO_TESTNET_ROLE_ID=${LOGTO_TESTNET_ROLE_ID}
ENV LOGTO_DEFAULT_ROLE_ID=${LOGTO_DEFAULT_ROLE_ID}
ENV LOGTO_MAINNET_ROLE_ID=${LOGTO_MAINNET_ROLE_ID}
ENV LOG_LEVEL=${LOG_LEVEL}

# API generation
ENV API_KEY_EXPIRATION=${API_KEY_EXPIRATION}

# Faucet setup
ENV ENABLE_ACCOUNT_TOPUP=${ENABLE_ACCOUNT_TOPUP}
ENV FAUCET_URI=${FAUCET_URI}
ENV TESTNET_MINIMUM_BALANCE=${TESTNET_MINIMUM_BALANCE}
ENV FAUCET_ACCESS_CLIENT_ID=${FAUCET_ACCESS_CLIENT_ID}

# Environment variables: Verida connector
ENV ENABLE_VERIDA_CONNECTOR=${ENABLE_VERIDA_CONNECTOR}
ENV POLYGON_RPC_URL=${POLYGON_RPC_URL}

# Environment variables: Stripe
ENV STRIPE_PUBLISHABLE_KEY=${STRIPE_PUBLISHABLE_KEY}
ENV STRIPE_ENABLED=${STRIPE_ENABLED}
ENV STRIPE_TEST_PLAN_ID=${STRIPE_TEST_PLAN_ID}
ENV STRIPE_BUILD_PLAN_ID=${STRIPE_BUILD_PLAN_ID}

# Set ownership permissions
RUN chown -R node:node /home/node/app

# Specify default port
EXPOSE ${PORT}

# Set user and shell
USER node
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

# Secrets (DB credentials, LogTo/Stripe/faucet secrets, private keys, provider API keys)
# must be injected at runtime, never baked into the image.

# Run the application
CMD ["npm", "start"]
