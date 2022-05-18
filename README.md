# cheqd: Credentials Back-end

## ℹ️ Overview

This repo is provides the backend components required for creating and managing Verifiable Credentials anchored to DIDs on cheqd mainnet using the  [`did:cheqd` method DIDs](architecture/adr-list/adr-002-cheqd-did-method.md)

To implement credential issuance, verification and management we built on top of [veramo.io](https://veramo.io/)'s SDK, since we found it was *highly* modular. 

[veramo.io](https://veramo.io/) is a JavaScript Framework for Verifiable Data that was designed to be flexible and modular which makes it an easy fit for a lot of complex workflows.

Create an agent, add plugins, run on a server or a frontend or mobile, or all of them combined. Veramo runs on Node, Browsers, and React Native straight out of the box. Save time by using the same API across all platforms.

Veramo is a core + some plugins. The core provides an entry point into the API, glues the plugins together and allows them to interoperate. Depending on which plugins you use, your instance of Veramo (your agent) can perform a variety of roles:

* Create and manage keys for signing and encryption
* Create and manage Decentralized Identifiers (DID)
* Issue Verifiable Credentials (VCs) and Presentations (VPs)
* Verify such VCs and VPs
* Present credentials using Selective Diclosure
* Communicate with other agents using DIDComm (or other protocols)
* Receive, filter, store and serve data
* Control other agents remotely, or act as a proxy for them

This works with the [cheqd-credential-issuer]([architecture/adr-list/adr-002-cheqd-did-method.md](https://github.com/cheqd/cheqd-credential-issuer)) and [did-provider-cheqd](https://github.com/cheqd/did-provider-cheqd) packages.


## 🧑‍💻 Using this repo


## 🛠 Steps to follow 

### 1. 


### 2. 


### 3. 


### 4. 


## Usage


## 🙋 Find us elsewhere

[![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/cheqd) [![Discord](https://img.shields.io/badge/Discord-7289DA?style=for-the-badge&logo=discord&logoColor=white)](http://cheqd.link/discord-github) [![Twitter](https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white)](https://twitter.com/intent/follow?screen_name=cheqd_io) [![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](http://cheqd.link/linkedin) [![Slack](https://img.shields.io/badge/Slack-4A154B?style=for-the-badge&logo=slack&logoColor=white)](http://cheqd.link/join-cheqd-slack) [![Medium](https://img.shields.io/badge/Medium-12100E?style=for-the-badge&logo=medium&logoColor=white)](https://blog.cheqd.io) [![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/channel/UCBUGvvH6t3BAYo5u41hJPzw/)
