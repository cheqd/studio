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
ARG ISSUER_ID="did:cheqd:testnet:55dbc8bf-fba3-4117-855c-1e0dc1d3bb47"
ARG ISSUER_ID_KID="59bfd030450c257f0e267dfc484158b0fc4e3d4b2b2f235a3790a09b6bec126a"
ARG ISSUER_ID_METHOD="did:cheqd:testnet:"
ARG ISSUER_ID_PUBLIC_KEY_HEX="59bfd030450c257f0e267dfc484158b0fc4e3d4b2b2f235a3790a09b6bec126a"
ARG ISSUER_ID_PRIVATE_KEY_HEX="8e09e82f72739956b48bdd934b09c96bcdd2d894d58f1801462dd15cb10b5cf459bfd030450c257f0e267dfc484158b0fc4e3d4b2b2f235a3790a09b6bec126a"
ARG ISSUER_ID_METHOD_SPECIFIC_ID="55dbc8bf-fba3-4117-855c-1e0dc1d3bb47"
ARG COSMOS_PAYER_MNEMONIC="sketch mountain erode window enact net enrich smoke claim kangaroo another visual write meat latin bacon pulp similar forum guilt father state erase bright"
ARG NETWORK_RPC_URL="https://rpc.cheqd.network"
ARG AUTH0_SERVICE_ENDPOINT="https://auth0-service-staging.cheqd.net/api/auth0/validate"

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

# We install Miniflare because we don't have the node_modules directory
# this image only has the output worker.js file.
RUN npm install -g miniflare@2.11.0 && \
    chown -R node:node /home/node/app && \
    apk update && \
    apk add --no-cache bash ca-certificates

# Specify default port
EXPOSE ${PORT}

# Set user and shell
USER node
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

# Run the application
CMD [ "miniflare", "worker.js" ]
