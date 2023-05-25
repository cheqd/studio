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

# Build-time arguments backend
ARG NPM_CONFIG_LOGLEVEL=warn
ARG PORT=3000
ARG ISSUER_SECRET_KEY
ARG ISSUER_DATABASE_URL
ARG ISSUER_DATABASE_CERT
ARG MAINNET_RPC_URL
ARG TESTNET_RPC_URL
ARG RESOLVER_URL
ARG ALLOWED_ORIGINS

# Run-time environment variables: backend
ENV NPM_CONFIG_LOGLEVEL ${NPM_CONFIG_LOGLEVEL}
ENV PORT ${PORT}
ENV ISSUER_SECRET_KEY ${ISSUER_SECRET_KEY}
ENV ISSUER_DATABASE_URL ${ISSUER_DATABASE_URL}
ENV ISSUER_DATABASE_CERT ${ISSUER_DATABASE_CERT}
ENV MAINNET_RPC_URL ${MAINNET_RPC_URL}
ENV TESTNET_RPC_URL ${TESTNET_RPC_URL}
ENV RESOLVER_URL ${RESOLVER_URL}
ENV ALLOWED_ORIGINS ${ALLOWED_ORIGINS}

# Specify default port
EXPOSE ${PORT}

# Set user and shell
USER node
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

# Run the application
CMD npm start
