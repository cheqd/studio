# Credential Service

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/cheqd/credential-service?color=green&label=stable%20release&style=flat-square)](https://github.com/cheqd/credential-service/releases/latest) ![GitHub Release Date](https://img.shields.io/github/release-date/cheqd/credential-service?color=green&style=flat-square) [![GitHub license](https://img.shields.io/github/license/cheqd/credential-service?color=blue&style=flat-square)](https://github.com/cheqd/credential-service/blob/main/LICENSE)

[![GitHub release (latest by date including pre-releases)](https://img.shields.io/github/v/release/cheqd/credential-service?include_prereleases&label=dev%20release&style=flat-square)](https://github.com/cheqd/credential-service/releases/) ![GitHub commits since latest release (by date)](https://img.shields.io/github/commits-since/cheqd/credential-service/latest?style=flat-square) [![GitHub contributors](https://img.shields.io/github/contributors/cheqd/credential-service?label=contributors%20%E2%9D%A4%EF%B8%8F&style=flat-square)](https://github.com/cheqd/credential-service/graphs/contributors)

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/cheqd/credential-service/dispatch.yml?label=workflows&style=flat-square)](https://github.com/cheqd/credential-service/actions/workflows/dispatch.yml) [![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/cheqd/credential-service/codeql.yml?label=CodeQL&style=flat-square)](https://github.com/cheqd/credential-service/actions/workflows/codeql.yml) ![GitHub repo size](https://img.shields.io/github/repo-size/cheqd/credential-service?style=flat-square)

## ℹ️ Overview

The purpose of this service is to issue and verify credentials. This service by itself does not take care of storing the credentials. If you'd like to store credentials, you would have to pair this service with [secret-box-service](https://github.com/cheqd/secret-box-service.git). This service is also dependent on [auth0-service](https://github.com/cheqd/auth0-service)

## 📖 Endpoints

### Issue a credential

- **Endpoint** POST `/1.0/api/credentials/issue`
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

- **Endpoint** POST `/1.0/api/credentials/verify`
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

## 🧑‍💻🛠 Developer Guide

### Setup

Dependencies can be installed using NPM or any other node package manager.

```bash
npm install
npm run build
```

### Configuration

The application expects the following environment variables to be defined for the app to function:

1. `ISSUER_DATABASE_URL`: The postgres database url e.g. `postgres://<user>:<password>@<host>:<port>/<database>?<query>`
2. `DB_ENCRYPTION_KEY`: A secret key for the veramo wallet
3. `PORT`: Port number for the credential service (optional)
4. `FEE_PAYER_MNENONIC_TESTNET`: Mnemonic for the issuer's Cosmos account to be used for testnet.
5. `FEE_PAYER_MNENONIC_MAINNET`: Mnemonic for the issuer's Cosmos account to be used for mainnet.
6. `MAINNET_RPC_URL`: Optional RPC URL for a node on cheqd mainnet, e.g., `https://rpc.cheqd.net`
7. `TESTNET_RPC_URL`: Optional RPC URL for a node on cheqd testnet, e.g., `https://rpc.cheqd.network`
8. `ISSUER_DATABASE_CERT`: Optional ca certificate parameter of the database

### Run

Run a postgres instance

```bash
docker pull postgres
docker run --name some-postgres -e POSTGRES_PASSWORD=mysecretpassword -d postgres
```

Construct the postgres url and configure the env variables mentioned above

Once configured, the app can be run using NPM:

```bash
npm start
```

Or, to build and run in Docker, use the [Dockerfile](Dockerfile) provided.

```bash
docker build -t credential-service .
```

## 🐞 Bug reports & 🤔 feature requests

If you notice anything not behaving how you expected, or would like to make a suggestion / request for a new feature, please create a [**new issue**](https://github.com/cheqd/credential-service/issues/new/choose) and let us know.

## 💬 Community

The [**cheqd Community Slack**](http://cheqd.link/join-cheqd-slack) is our primary chat channel for the open-source community, software developers, and node operators.

Please reach out to us there for discussions, help, and feedback on the project.

## 🙋 Find us elsewhere

[![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge\&logo=telegram\&logoColor=white)](https://t.me/cheqd) [![Discord](https://img.shields.io/badge/Discord-7289DA?style=for-the-badge\&logo=discord\&logoColor=white)](http://cheqd.link/discord-github) [![Twitter](https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge\&logo=twitter\&logoColor=white)](https://twitter.com/intent/follow?screen\_name=cheqd\_io) [![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge\&logo=linkedin\&logoColor=white)](http://cheqd.link/linkedin) [![Slack](https://img.shields.io/badge/Slack-4A154B?style=for-the-badge\&logo=slack\&logoColor=white)](http://cheqd.link/join-cheqd-slack) [![Medium](https://img.shields.io/badge/Medium-12100E?style=for-the-badge\&logo=medium\&logoColor=white)](https://blog.cheqd.io) [![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge\&logo=youtube\&logoColor=white)](https://www.youtube.com/channel/UCBUGvvH6t3BAYo5u41hJPzw/)

