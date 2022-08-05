# cheqd: Credentials Service

## ℹ️ Overview

The purpose of this package is to connect the Veramo SDK for cheqd to cheqd's demo web-app ([wallet.cheqd.io](https://wallet.cheqd.io/welcome)). 

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

* [`did-provider-cheqd`](https://github.com/cheqd/did-provider-cheqd) which provides the functiomaltiy for writing to the ledger, using the Veramo SDK.

The key Veramo packages utilised include:

* [`@veramo/core`](https://github.com/uport-project/veramo/tree/next/packages/core)
* [`@veramo/credential-w3c`](https://github.com/uport-project/veramo/tree/next/packages/credential-w3c)

Find out about other Veramo plug-ins at [`veramo_agent/plugins/`](https://veramo.io/docs/veramo_agent/plugins/).

### Setup

Dependencies can be installed using Yarn or any other package manager.

```bash
yarn install
```

### Config

### Deploy

#### Local deployment

#### Staging deployment

#### Production deployment
