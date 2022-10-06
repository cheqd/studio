###############################################################
###        STAGE 1: Runtime BigDipper container        		###
###############################################################

FROM node:16-alpine AS runner

# Install pre-requisite packages
RUN apk update && apk add --no-cache git bash

# Set working directory & bash defaults
WORKDIR /home/node/app

# Copy source files
COPY . .

# Installing dependencies
RUN npm ci

# Build-time arguments

ARG NPM_CONFIG_LOGLEVEL
ARG PORT=8787
ARG ISSUER_ID
ARG ISSUER_ID_KID
ARG ISSUER_ID_METHOD
ARG ISSUER_ID_PUBLIC_KEY_HEX
ARG ISSUER_ID_PRIVATE_KEY_HEX
ARG ISSUER_ID_METHOD_SPECIFIC_ID
ARG COSMOS_PAYER_MNEMONIC
ARG AUTH0_SERVICE_ENDPOINT

# Run-time environment variables

ENV NPM_CONFIG_LOGLEVEL ${NPM_CONFIG_LOGLEVEL}
ENV PORT ${PORT}
ENV ISSUER_ID
ENV ISSUER_ID_KID
ENV ISSUER_ID_METHOD
ENV ISSUER_ID_PUBLIC_KEY_HEX
ENV ISSUER_ID_PRIVATE_KEY_HEX
ENV ISSUER_ID_METHOD_SPECIFIC_ID
ENV COSMOS_PAYER_MNEMONIC
ENV AUTH0_SERVICE_ENDPOINT

# Build the app
RUN npm run build

# Specify default port
EXPOSE ${PORT}

# Set user and shell
USER node
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

# Run the application
CMD [ "npm", "start" ]
