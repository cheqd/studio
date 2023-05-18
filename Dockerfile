###############################################################
###         STAGE 1: Build credential-service app           ###
###############################################################

FROM node:18-alpine AS runner

# Set working directory & bash defaults
WORKDIR /home/node/app

# Copy source files
COPY . .

# Installing dependencies
RUN npm ci

# Build the app
RUN npm run build

# Build-time arguments
ARG NODE_ENV=production
ARG NPM_CONFIG_LOGLEVEL=warn
ARG PORT=8787
ARG ISSUER_SECRET_KEY
ARG ISSUER_DATABASE_URL
ARG ISSUER_DATABASE_CERT
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
ENV ISSUER_DATABASE_CERT ${ISSUER_DATABASE_CERT}
ENV MAINNET_RPC_URL ${MAINNET_RPC_URL}
ENV TESTNET_RPC_URL ${TESTNET_RPC_URL}
ENV RESOLVER_URL ${RESOLVER_URL}
ENV ALLOWED_ORIGINS ${ALLOWED_ORIGINS}

RUN chown -R node:node /home/node/app/packages

# Specify default port
EXPOSE ${PORT}

# Set user and shell
USER node
SHELL ["/bin/sh", "-euo", "pipefail", "-c"]

# Run the application
CMD npm run backend
