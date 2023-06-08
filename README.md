# Credential Service

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/cheqd/credential-service?color=green&label=stable%20release&style=flat-square)](https://github.com/cheqd/credential-service/releases/latest) ![GitHub Release Date](https://img.shields.io/github/release-date/cheqd/credential-service?color=green&style=flat-square) [![GitHub license](https://img.shields.io/github/license/cheqd/credential-service?color=blue&style=flat-square)](https://github.com/cheqd/credential-service/blob/main/LICENSE)

[![GitHub release (latest by date including pre-releases)](https://img.shields.io/github/v/release/cheqd/credential-service?include_prereleases&label=dev%20release&style=flat-square)](https://github.com/cheqd/credential-service/releases/) ![GitHub commits since latest release (by date)](https://img.shields.io/github/commits-since/cheqd/credential-service/latest?style=flat-square) [![GitHub contributors](https://img.shields.io/github/contributors/cheqd/credential-service?label=contributors%20%E2%9D%A4%EF%B8%8F&style=flat-square)](https://github.com/cheqd/credential-service/graphs/contributors)

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/cheqd/credential-service/dispatch.yml?label=workflows&style=flat-square)](https://github.com/cheqd/credential-service/actions/workflows/dispatch.yml) [![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/cheqd/credential-service/codeql.yml?label=CodeQL&style=flat-square)](https://github.com/cheqd/credential-service/actions/workflows/codeql.yml) ![GitHub repo size](https://img.shields.io/github/repo-size/cheqd/credential-service?style=flat-square)

## ℹ️ Overview

The purpose of this service is to issue and verify credentials. This service by itself does not take care of storing the credentials. If you'd like to store credentials, you would have to pair this service with [secret-box-service](https://github.com/cheqd/secret-box-service.git). This service is also dependent on [auth0-service](https://github.com/cheqd/auth0-service)

## 📖 Endpoints

### Issue a credential

- **Endpoint** POST `/credentials/issue`
- **Accepts**: `application/json`
- **Request Body**: JSON object with following fields
  - `attributes` - A json object with all the credential attributes
  - `subjectDid` - DID of the holder of the credential
  - `type` - A string representation of the credential type e.g. "PERSON" (optional)
  - `@context` - context of the issued credential (optional)
  - `expirationDate` - Date of expiration of the JWT (optional)
- **Success Response Code**: 200
- **Invalid Request Response Code** - 400
- **Internal Error Response Code** - 500

### Verify a Credential

- **Endpoint** POST `/credentials/verify`
- **Accepts**: `application/json`
- **Request Body**: JSON object with following fields:
  - `credential` - A verifiable credential or the JWT string
- **Success Response Code** - 200
- **Invalid Request Response Code**:
  - 400: Bad request body
  - 405: Wrong content type
- **Internal Error Response Code** - 500

### Health Check

- **Endpoint**: `/` (This endpoint redirects to the swagger api docs)

## 🔧 Configuration

The application allows configuring the following parameters using environment variables.

### Core configuration

#### Network API endpoints

1. `MAINNET_RPC_URL`: RPC endpoint for cheqd mainnet (Default: `https://rpc.cheqd.net:443`).
2. `TESTNET_RPC_URL`: RPC endpoint for cheqd testnet (`https://rpc.cheqd.network:443`).
3. `RESOLVER_URL`: API endpoint for a [DID Resolver](https://github.com/cheqd/did-resolver) endpoint that supports `did:cheqd`.
4. `ALLOWED_ORIGINS`: CORS allowed origins used in the app.

#### Veramo KMS Database

The application supports two modes in which keys are managed: either just storing them in-memory while a container is running, or persisting them in a PostgresSQL database with Veramo SDK. Using an external Postgres database allows for "custodian" mode where identity and cheqd/Cosmos keys can be offloaded by client applications to be stored in the database.

1. `ENABLE_EXTERNAL_DB`: Turns external database on/off (Default: `false`). If `ENABLE_EXTERNAL_DB=true`, then define below environment variables in `.env` file:
    - `DB_CONNECTION_URL`: Postgres database connection URL, e.g. `postgres://<user>:<password>@<host>:<port>/<database>`.
    - `DB_ENCRYPTION_KEY`: Secret key used to encrypt the Veramo key-specific database tables. This adds a layer of protection by not storing the database in plaintext.
    - `DB_CERTIFICATE`: Custom CA certificate required to connect to the database (optional).
    - `POSTGRES_USER`: Postgres database username using in database connection URL.
    - `POSTGRES_PASSWORD`: Postgres database password using in database connection URL.
    - `POSTGRES_DB`: Postgres database name using in database connection URL.
    > **Note:** `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` environment variables need only for [running your own credential-service using Docker](#running-your-own-credential-service-using-docker).

#### API Authentication using LogTo

By default, the application has API authentication disabled (which can be changed in configuration). If, however, you'd like to run the app with API authentication features, the following variables need to be configured.

We use a self-hosted version of [LogTo](https://logto.io/), which supports OpenID Connect. Theoretically, these values could also be replaced with [LogTo Cloud](http://cloud.logto.io/) or any other OpenID Connect identity provider.

1. `ENABLE_AUTHENTICATION`: Turns API authentication guards on/off (Default: `false`). If `ENABLE_AUTHENTICATION=false`, then define below environment variable in `.env` file:
    - `DEFAULT_CUSTOMER_ID`: Customer/user in LogTo to use for unauthenticated users.

### 3rd Party Connectors

The app supports 3rd party connectors for credential storage and delivery.

#### Verida

The app's [Verida Network](https://www.verida.network/) connector can be enabled to deliver generated credentials to Verida Wallet.

1. `ENABLE_VERIDA_CONNECTOR`: Turns Verida connector on/off (Default: `false`). If `ENABLE_VERIDA_CONNECTOR=true`, then define below environment variables in `.env` file:
    - `VERIDA_NETWORK`: Verida Network type to connect to. (Default: `testnet`)
    - `VERIDA_PRIVATE_KEY`: Secret key for Verida Network API.
    - `POLYGON_PRIVATE_KEY`: Secret key for Polygon Network.

### Run the application

Initiate a Postgres database, in case you're using an external database.

```bash
docker pull postgres
docker run --name some-postgres -e POSTGRES_PASSWORD=mysecretpassword -d postgres
```

Construct the postgres URL and configure the env variables mentioned above.

Once configured, install dependencies and the app can be build using NPM:

```bash
npm install
npm run build
```

Run migration using NPM:

```bash
npm run migration
```

The app can be run using NPM:

```bash
npm start
```

## 🧑‍💻🛠 Developer Guide

### Running your own credential-service using Docker

Construct the postgres URL and configure the env variables mentioned above.

Spinning up a Docker container from the [pre-built credential-service Docker image on Github](https://github.com/cheqd/credential-service/pkgs/container/credential-service) is as simple as the command below:

- Running credential-service using Docker with external database:

    ```bash
    docker compose -f docker/docker-compose.yml up --detach
  ```

- Running credential-service using Docker without external database (In memory database):

    ```bash
    docker compose -f docker/docker-compose.yml up credential-service --detach
    ```

### Build using Docker

To build and run in Docker, use the [Dockerfile](docker/Dockerfile) provided.

```bash
docker build --file docker/Dockerfile --tag credential-service .
```

## 🐞 Bug reports & 🤔 feature requests

If you notice anything not behaving how you expected, or would like to make a suggestion / request for a new feature, please create a [**new issue**](https://github.com/cheqd/credential-service/issues/new/choose) and let us know.

## 💬 Community

The [**cheqd Community Slack**](http://cheqd.link/join-cheqd-slack) is our primary chat channel for the open-source community, software developers, and node operators.

Please reach out to us there for discussions, help, and feedback on the project.

## 🙋 Find us elsewhere

[![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge\&logo=telegram\&logoColor=white)](https://t.me/cheqd) [![Discord](https://img.shields.io/badge/Discord-7289DA?style=for-the-badge\&logo=discord\&logoColor=white)](http://cheqd.link/discord-github) [![Twitter](https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge\&logo=twitter\&logoColor=white)](https://twitter.com/intent/follow?screen\_name=cheqd\_io) [![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge\&logo=linkedin\&logoColor=white)](http://cheqd.link/linkedin) [![Slack](https://img.shields.io/badge/Slack-4A154B?style=for-the-badge\&logo=slack\&logoColor=white)](http://cheqd.link/join-cheqd-slack) [![Medium](https://img.shields.io/badge/Medium-12100E?style=for-the-badge\&logo=medium\&logoColor=white)](https://blog.cheqd.io) [![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge\&logo=youtube\&logoColor=white)](https://www.youtube.com/channel/UCBUGvvH6t3BAYo5u41hJPzw/)
