# Credential Service

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/cheqd/credential-service?color=green&label=stable%20release&style=flat-square)](https://github.com/cheqd/credential-service/releases/latest) ![GitHub Release Date](https://img.shields.io/github/release-date/cheqd/credential-service?color=green&style=flat-square) [![GitHub license](https://img.shields.io/github/license/cheqd/credential-service?color=blue&style=flat-square)](https://github.com/cheqd/credential-service/blob/main/LICENSE)

[![GitHub release (latest by date including pre-releases)](https://img.shields.io/github/v/release/cheqd/credential-service?include_prereleases&label=dev%20release&style=flat-square)](https://github.com/cheqd/credential-service/releases/) ![GitHub commits since latest release (by date)](https://img.shields.io/github/commits-since/cheqd/credential-service/latest?style=flat-square) [![GitHub contributors](https://img.shields.io/github/contributors/cheqd/credential-service?label=contributors%20%E2%9D%A4%EF%B8%8F&style=flat-square)](https://github.com/cheqd/credential-service/graphs/contributors)

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/cheqd/credential-service/dispatch.yml?label=workflows&style=flat-square)](https://github.com/cheqd/credential-service/actions/workflows/dispatch.yml) [![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/cheqd/credential-service/codeql.yml?label=CodeQL&style=flat-square)](https://github.com/cheqd/credential-service/actions/workflows/codeql.yml) ![GitHub repo size](https://img.shields.io/github/repo-size/cheqd/credential-service?style=flat-square)

## ℹ️ Overview

The purpose of this service is to issue and verify credentials. This service by itself does not take care of storing the credentials. If you'd like to store credentials, you would have to pair this service with [secret-box-service](https://github.com/cheqd/secret-box-service.git). This service is also dependent on [auth0-service](https://github.com/cheqd/auth0-service)

## 📖 Usage

We run hosted endpoints for this package (in case you don't want to run it yourself) which have Swagger / OpenAPI definition endpoints that list all of the APIs and how they work.

The Swagger API definition pages are:

- [Production / Stable Release APIs](https://credential-service.cheqd.net/swagger/)
- [Staging / Development Release APIs](https://credential-service-staging.cheqd.net/swagger/)

## 🔧 Configuration

The application allows configuring the following parameters using environment variables.

### Core configuration

#### Network API endpoints

1. `MAINNET_RPC_URL`: RPC endpoint for cheqd mainnet (Default: `https://rpc.cheqd.net:443`).
2. `TESTNET_RPC_URL`: RPC endpoint for cheqd testnet (`https://rpc.cheqd.network:443`).
3. `RESOLVER_URL`: API endpoint for a [DID Resolver](https://github.com/cheqd/did-resolver) endpoint that supports `did:cheqd`.
4. `APPLICATION_BASE_URL`: URL of the application (external domain name).
5. `ALLOWED_ORIGINS`: CORS allowed origins used in the app.

#### Veramo KMS Database

The application supports two modes in which keys are managed: either just storing them in-memory while a container is running, or persisting them in a PostgresSQL database with Veramo SDK. Using an external Postgres database allows for "custodian" mode where identity and cheqd/Cosmos keys can be offloaded by client applications to be stored in the database.

1. `ENABLE_EXTERNAL_DB`: Turns external database on/off (Default: `false`). If `ENABLE_EXTERNAL_DB=true`, then define below environment variables in `.env` file:
    - `EXTERNAL_DB_CONNECTION_URL`: Postgres database connection URL, e.g. `postgres://<user>:<password>@<host>:<port>/<database>`.
    - `EXTERNAL_DB_ENCRYPTION_KEY`: Secret key used to encrypt the Veramo key-specific database tables. This adds a layer of protection by not storing the database in plaintext.
    - `EXTERNAL_DB_CERTIFICATE`: Custom CA certificate required to connect to the database (optional).

#### API Authentication using LogTo

By default, the application has API authentication disabled (which can be changed in configuration). If, however, you'd like to run the app with API authentication features, the following variables need to be configured.

We use a self-hosted version of [LogTo](https://logto.io/), which supports OpenID Connect. Theoretically, these values could also be replaced with [LogTo Cloud](http://cloud.logto.io/) or any other OpenID Connect identity provider.

1. `ENABLE_AUTHENTICATION`: Turns API authentication guards on/off (Default: `false`). If `ENABLE_AUTHENTICATION=false`, then define below environment variable in `.env` file:
    - `DEFAULT_CUSTOMER_ID`: Customer/user in LogTo to use for unauthenticated users.
2. `LOGTO_ENDPOINT`: API endpoint for LogTo server
3. `LOGTO_DEFAULT_RESOURCE_URL`: Usually it will be a root of all API resources. All the resourceAPI will be constructed on top of that.
4. `LOGTO_APP_ID`: Application ID from LogTo. For now, Application is supposed to be a TraditionalWeb
5. `LOGTO_APP_SECRET`: Application secret. Also should encrypted in deployment
6. `LOGTO_M2M_APP_ID`: Machine-to-machine Application ID
7. `LOGTO_M2M_APP_SECRET`: Machine-to-machine Application secret
8. `LOGTO_MANAGEMENT_API`: URL of management API for LogTo (default is `https://default.logto.app/api`)
9. `ALLOWED_ORIGINS`: CORS allowed origins used in the app
10. `DEFAULT_CUSTOMER_ID`: Customer/user in LogTo to use for unauthenticated users
11. `COOKIE_SECRET`: Secret for cookie encryption.

### 3rd Party Connectors

The app supports 3rd party connectors for credential storage and delivery.

#### Verida

The app's [Verida Network](https://www.verida.network/) connector can be enabled to deliver generated credentials to Verida Wallet.

1. `ENABLE_VERIDA_CONNECTOR`: Turns Verida connector on/off (Default: `false`). If `ENABLE_VERIDA_CONNECTOR=true`, then define below environment variables in `.env` file:
    - `VERIDA_NETWORK`: Verida Network type to connect to. (Default: `testnet`)
    - `VERIDA_PRIVATE_KEY`: Secret key for Verida Network API.
    - `POLYGON_PRIVATE_KEY`: Secret key for Polygon Network.

## 🧑‍💻🛠 Developer Guide

### Run as standalone application using Docker Compose

If you want to run the application without any external databases or dependent services, we provide [a Docker Compose file](docker/no-external-db/docker-compose-no-db.yml) to spin up a standalone service.

```bash
docker compose -f docker/no-external-db/docker-compose-no-db.yml up --detach
```

This standalone service uses an in-memory database with no persistence, and therefore is recommended only if you're managing key/secret storage separately.

The [`no-db.env` file](docker/no-external-db/no-db.env) in the same folder contains all the environment variables necessary to configure the service. (See section *Configuration* above.)

### Run with external Key Management System (KMS) and/or authentication service using Docker Compose

Construct the postgres URL and configure the env variables mentioned above.

Spinning up a Docker container from the [pre-built credential-service Docker image on Github](https://github.com/cheqd/credential-service/pkgs/container/credential-service) is as simple as the command below:

- Running credential-service using Docker with external database:
  - Set `POSTGRES_USER`, `POSTGRES_PASSWORD` environment variables in `docker/with-external-db/postgres.env`:
    - `POSTGRES_USER`: Postgres database username using in Docker database service.
    - `POSTGRES_PASSWORD`: Postgres database password using in Docker database service.
    - `POSTGRES_MULTIPLE_DATABASES`: Postgres multiple databases, e.g.: `POSTGRES_MULTIPLE_DATABASES="app,logto"`.

Run LogTo service:

```bash
docker compose -f docker/with-external-db/docker-compose-with-db.yml --profile logto up --detach
```

Run credential-service:

```bash
docker compose -f docker/with-external-db/docker-compose-with-db.yml --profile app up --detach
```

### Build using Docker

To build your own image using Docker, use the [Dockerfile](docker/Dockerfile) provided.

```bash
docker build --file docker/Dockerfile --target runner . --tag credential-service:local
```

## 🐞 Bug reports & 🤔 feature requests

If you notice anything not behaving how you expected, or would like to make a suggestion / request for a new feature, please create a [**new issue**](https://github.com/cheqd/credential-service/issues/new/choose) and let us know.

## 💬 Community

The [**cheqd Community Slack**](http://cheqd.link/join-cheqd-slack) is our primary chat channel for the open-source community, software developers, and node operators.

Please reach out to us there for discussions, help, and feedback on the project.

## 🙋 Find us elsewhere

[![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge\&logo=telegram\&logoColor=white)](https://t.me/cheqd) [![Discord](https://img.shields.io/badge/Discord-7289DA?style=for-the-badge\&logo=discord\&logoColor=white)](http://cheqd.link/discord-github) [![Twitter](https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge\&logo=twitter\&logoColor=white)](https://twitter.com/intent/follow?screen\_name=cheqd\_io) [![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge\&logo=linkedin\&logoColor=white)](http://cheqd.link/linkedin) [![Slack](https://img.shields.io/badge/Slack-4A154B?style=for-the-badge\&logo=slack\&logoColor=white)](http://cheqd.link/join-cheqd-slack) [![Medium](https://img.shields.io/badge/Medium-12100E?style=for-the-badge\&logo=medium\&logoColor=white)](https://blog.cheqd.io) [![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge\&logo=youtube\&logoColor=white)](https://www.youtube.com/channel/UCBUGvvH6t3BAYo5u41hJPzw/)
