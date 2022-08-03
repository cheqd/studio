# cheqd: Credentials Service

## ℹ️ Overview

The purpose of this package is to connect the Veramo SDK for cheqd to cheqd's demo web-app wallet - [wallet.cheqd.io](https://wallet.cheqd.io/welcome).

Using this package, users are able to provide a way in which a wallet holder can request a JSON credential (JWT proofed) and hold this in a web-app.

We have offered this as a reference implementation of how someone may utilise the cheqd and veramo packages on a web application.

For our implementation we used:

* Cloudflare
* Auth0
* IPFS storage

See below for a diagram of our reference implementation:

INSERT DIAGRAM

## 🧑‍💻🛠 Developer Guide

### Architecture

This package works alongside a blend of cheqd packages and Veramo packages.

These cheqd packages include:

* cheqd's [`SDK`](https://github.com/cheqd/sdk) package
* [`did-provider-cheqd`](https://github.com/cheqd/did-provider-cheqd) which provides the functiomaltiy for writing to the ledger, using the Veramo SDK.

The key Veramo packages utilised include:

* [`@veramo/core`](https://github.com/uport-project/veramo/tree/next/packages/core)
* [`@veramo/cli`](https://github.com/uport-project/veramo/tree/next/packages/cli)
* [`@veramo/credential-w3c`](https://github.com/uport-project/veramo/tree/next/packages/credential-w3c)

Find out about other Veramo plug-ins at [`veramo_agent/plugins/`](https://veramo.io/docs/veramo_agent/plugins/)

* [DID Module](https://github.com/cheqd/sdk/blob/main/src/modules/did.ts)
* [@cosmjs](https://github.com/cheqd/sdk/blob/main/src/modules/_.ts)

### Setup

Dependencies can be installed using Yarn or any other package manager.

```bash
yarn install
```

### Config

A default agent configuration is provided with the [`agent.yml`](https://github.com/cheqd/did-provider-cheqd/blob/main/agent.yml) file.

To specify further configurations, see the Veramo docs, however when making changes, ensure the cheqd specific suggested configurations are retained.

### Deploy

`credentials-service`

`cheqd/sdk` supports the same out of the box use cases as Veramo provides.

As such, this can be utilised in a backend (server-side) envrionment or frontend (browser/web) application, or in a CLI specific applications by leverage [`@veramo/cli`](https://github.com/uport-project/veramo/tree/next/packages/cli).

## 📄 Documentation

## 🙋 Find us elsewhere

[![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/cheqd) [![Discord](https://img.shields.io/badge/Discord-7289DA?style=for-the-badge&logo=discord&logoColor=white)](http://cheqd.link/discord-github) [![Twitter](https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white)](https://twitter.com/intent/follow?screen_name=cheqd_io) [![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](http://cheqd.link/linkedin) [![Slack](https://img.shields.io/badge/Slack-4A154B?style=for-the-badge&logo=slack&logoColor=white)](http://cheqd.link/join-cheqd-slack) [![Medium](https://img.shields.io/badge/Medium-12100E?style=for-the-badge&logo=medium&logoColor=white)](https://blog.cheqd.io) [![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/channel/UCBUGvvH6t3BAYo5u41hJPzw/)
=======
=======
