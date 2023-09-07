# Changelog

## [2.9.2-develop.2](https://github.com/cheqd/credential-service/compare/2.9.2-develop.1...2.9.2-develop.2) (2023-09-07)


### Bug Fixes

* Check API responses are provided correctly in Swagger document [DEV-3133] ([#359](https://github.com/cheqd/credential-service/issues/359)) ([5b13ffa](https://github.com/cheqd/credential-service/commit/5b13ffa012624f9fc1d64f4bb1ba2a3789aed93c))

## [2.9.2-develop.1](https://github.com/cheqd/credential-service/compare/2.9.1...2.9.2-develop.1) (2023-09-07)


### Bug Fixes

* Enable updated state explicitly ([c3d9170](https://github.com/cheqd/credential-service/commit/c3d9170e7c1d305e1a46422002b3a217279e7514))

## [2.9.1](https://github.com/cheqd/credential-service/compare/2.9.0...2.9.1) (2023-09-06)


### Bug Fixes

* Bump to original patch release + remove intermittent patch ([#369](https://github.com/cheqd/credential-service/issues/369)) ([8ec1705](https://github.com/cheqd/credential-service/commit/8ec17058ba2e54e2b39452cbcd2d81d99cac603f))
* Fix namespace lookup [DEV-3150] ([#360](https://github.com/cheqd/credential-service/issues/360)) ([53cc021](https://github.com/cheqd/credential-service/commit/53cc0213ac00bad3a7a4dacc75c2aefab2c212e4))
* Fix problem with 'verifyStatus=true' parameter in '/credential/verify' API [DEV-3170] ([#368](https://github.com/cheqd/credential-service/issues/368)) ([309e980](https://github.com/cheqd/credential-service/commit/309e980af50361e93d815aa9e9c1bec82838eb6f))
* Fix problem with `/status-list/update/encrypted` API - it doesn't work [DEV-3182] ([#366](https://github.com/cheqd/credential-service/issues/366)) ([fbb7af4](https://github.com/cheqd/credential-service/commit/fbb7af433dfad2d34dc1a8e4e5e96acf116e7a2c))
* Revert monkey-patch (seems like a bad merge) [DEV-3181] ([#365](https://github.com/cheqd/credential-service/issues/365)) ([e2cc72c](https://github.com/cheqd/credential-service/commit/e2cc72c8e8701aeba954853445e5d5600adb35f9))

## [2.9.1-develop.5](https://github.com/cheqd/credential-service/compare/2.9.1-develop.4...2.9.1-develop.5) (2023-09-06)


### Bug Fixes

* Bump to original patch release + remove intermittent patch ([#369](https://github.com/cheqd/credential-service/issues/369)) ([8ec1705](https://github.com/cheqd/credential-service/commit/8ec17058ba2e54e2b39452cbcd2d81d99cac603f))

## [2.9.1-develop.4](https://github.com/cheqd/credential-service/compare/2.9.1-develop.3...2.9.1-develop.4) (2023-09-05)


### Bug Fixes

* Fix problem with 'verifyStatus=true' parameter in '/credential/verify' API [DEV-3170] ([#368](https://github.com/cheqd/credential-service/issues/368)) ([309e980](https://github.com/cheqd/credential-service/commit/309e980af50361e93d815aa9e9c1bec82838eb6f))

## [2.9.1-develop.3](https://github.com/cheqd/credential-service/compare/2.9.1-develop.2...2.9.1-develop.3) (2023-09-05)


### Bug Fixes

* Fix problem with `/status-list/update/encrypted` API - it doesn't work [DEV-3182] ([#366](https://github.com/cheqd/credential-service/issues/366)) ([fbb7af4](https://github.com/cheqd/credential-service/commit/fbb7af433dfad2d34dc1a8e4e5e96acf116e7a2c))

## [2.9.1-develop.2](https://github.com/cheqd/credential-service/compare/2.9.1-develop.1...2.9.1-develop.2) (2023-09-04)


### Bug Fixes

* Revert monkey-patch (seems like a bad merge) [DEV-3181] ([#365](https://github.com/cheqd/credential-service/issues/365)) ([e2cc72c](https://github.com/cheqd/credential-service/commit/e2cc72c8e8701aeba954853445e5d5600adb35f9))

## [2.9.1-develop.1](https://github.com/cheqd/credential-service/compare/2.9.0...2.9.1-develop.1) (2023-08-31)


### Bug Fixes

* Fix namespace lookup [DEV-3150] ([#360](https://github.com/cheqd/credential-service/issues/360)) ([53cc021](https://github.com/cheqd/credential-service/commit/53cc0213ac00bad3a7a4dacc75c2aefab2c212e4))

## [2.9.0](https://github.com/cheqd/credential-service/compare/2.8.0...2.9.0) (2023-08-29)


### Features

* Added encrypted StatusList APIs + enhanced type safety ([#350](https://github.com/cheqd/credential-service/issues/350)) ([951e2b4](https://github.com/cheqd/credential-service/commit/951e2b45af6299b09e16d6037baa9c5eaf595068))
* Change from `did/:did` to `did/search/:didUrl` endpoint and support query parameters for DID endpoint in Credential Service [DEV-3097] ([#331](https://github.com/cheqd/credential-service/issues/331)) ([4e34b76](https://github.com/cheqd/credential-service/commit/4e34b76f1a9695cf48ae8551feb24840e4c0d4d6))


### Bug Fixes

* Credential Service Staging - Resolve issue with page not loading and broken login [DEV-3162] ([#358](https://github.com/cheqd/credential-service/issues/358)) ([419d2ec](https://github.com/cheqd/credential-service/commit/419d2ecb65bb9b365bf9aae5bc8e39e9a08d79ea))
* Fix problem with agent initialize [DEV-3146] ([#346](https://github.com/cheqd/credential-service/issues/346)) ([45e1074](https://github.com/cheqd/credential-service/commit/45e1074925c6262d8034df1a0e3a5311987d36c2))
* Validate did access on operation ([#351](https://github.com/cheqd/credential-service/issues/351)) ([8bbfce1](https://github.com/cheqd/credential-service/commit/8bbfce19a462e78004f7a8f884929ee89d8fcc40))

## [2.9.0-develop.7](https://github.com/cheqd/credential-service/compare/2.9.0-develop.6...2.9.0-develop.7) (2023-08-29)

## [2.9.0-develop.6](https://github.com/cheqd/credential-service/compare/2.9.0-develop.5...2.9.0-develop.6) (2023-08-29)

## [2.9.0-develop.5](https://github.com/cheqd/credential-service/compare/2.9.0-develop.4...2.9.0-develop.5) (2023-08-29)


### Bug Fixes

* Credential Service Staging - Resolve issue with page not loading and broken login [DEV-3162] ([#358](https://github.com/cheqd/credential-service/issues/358)) ([419d2ec](https://github.com/cheqd/credential-service/commit/419d2ecb65bb9b365bf9aae5bc8e39e9a08d79ea))

## [2.9.0-develop.4](https://github.com/cheqd/credential-service/compare/2.9.0-develop.3...2.9.0-develop.4) (2023-08-25)


### Features

* Added encrypted StatusList APIs + enhanced type safety ([#350](https://github.com/cheqd/credential-service/issues/350)) ([951e2b4](https://github.com/cheqd/credential-service/commit/951e2b45af6299b09e16d6037baa9c5eaf595068))

## [2.9.0-develop.3](https://github.com/cheqd/credential-service/compare/2.9.0-develop.2...2.9.0-develop.3) (2023-08-23)


### Bug Fixes

* Validate did access on operation ([#351](https://github.com/cheqd/credential-service/issues/351)) ([8bbfce1](https://github.com/cheqd/credential-service/commit/8bbfce19a462e78004f7a8f884929ee89d8fcc40))

## [2.9.0-develop.2](https://github.com/cheqd/credential-service/compare/2.9.0-develop.1...2.9.0-develop.2) (2023-08-21)


### Bug Fixes

* Fix problem with agent initialize [DEV-3146] ([#346](https://github.com/cheqd/credential-service/issues/346)) ([45e1074](https://github.com/cheqd/credential-service/commit/45e1074925c6262d8034df1a0e3a5311987d36c2))

## [2.9.0-develop.1](https://github.com/cheqd/credential-service/compare/2.8.0...2.9.0-develop.1) (2023-08-18)


### Features

* Change from `did/:did` to `did/search/:didUrl` endpoint and support query parameters for DID endpoint in Credential Service [DEV-3097] ([#331](https://github.com/cheqd/credential-service/issues/331)) ([4e34b76](https://github.com/cheqd/credential-service/commit/4e34b76f1a9695cf48ae8551feb24840e4c0d4d6))

## [2.8.0](https://github.com/cheqd/credential-service/compare/2.7.1...2.8.0) (2023-08-15)


### Features

* Account bootstrapping [DEV-3051] ([#306](https://github.com/cheqd/credential-service/issues/306)) ([d157535](https://github.com/cheqd/credential-service/commit/d15753545d0b90d499e083ea6219bf28f97913ff))
* Remove `DEFAULT_CUSTOMER_ID` [DEV-2851] ([#318](https://github.com/cheqd/credential-service/issues/318)) ([c072af6](https://github.com/cheqd/credential-service/commit/c072af6a96ac5485e54b976753fa48f852fd8354))


### Bug Fixes

* Add data reset before each check ([#326](https://github.com/cheqd/credential-service/issues/326)) ([659a120](https://github.com/cheqd/credential-service/commit/659a120e5dd6221d32b0132802c381ca819860a0))
* Add M2M token refreshing [DEV-3117] ([#327](https://github.com/cheqd/credential-service/issues/327)) ([be04d92](https://github.com/cheqd/credential-service/commit/be04d928669fe1637c9bea795566bbcb80c61360))
* Added base reference syntax + error handling [DEV-3127] ([#338](https://github.com/cheqd/credential-service/issues/338)) ([4b6048d](https://github.com/cheqd/credential-service/commit/4b6048d0029b0f25eeb838e845923af5ef252a7a))
* Cleanups ([#314](https://github.com/cheqd/credential-service/issues/314)) ([3b8e4ad](https://github.com/cheqd/credential-service/commit/3b8e4adaa3154ce4df793d14777be978b05a91e9))
* Cleanups [DEV-3050] ([#307](https://github.com/cheqd/credential-service/issues/307)) ([2e6b969](https://github.com/cheqd/credential-service/commit/2e6b9699203b8e013bf5e36a03a396d4a0bc649e))
* Faucet setup configuration variables [DEV-3135] ([#342](https://github.com/cheqd/credential-service/issues/342)) ([eb7feac](https://github.com/cheqd/credential-service/commit/eb7feac647e96bf1a5fab79bbbc891e4007539cc))
* Fix auth button ([#324](https://github.com/cheqd/credential-service/issues/324)) ([3f88668](https://github.com/cheqd/credential-service/commit/3f8866847b0a90534a80a0a131604cb148c8b701))
* Implement dynamic login/logout button based on user's logged in state [DEV-3092] ([#316](https://github.com/cheqd/credential-service/issues/316)) ([4a2e40d](https://github.com/cheqd/credential-service/commit/4a2e40d685d3ed7b3a69298f8fd4dbc5b6d82f2c))
* Move to using scopes correctly from LogTo [DEV-3090] ([#317](https://github.com/cheqd/credential-service/issues/317)) ([3f5e16b](https://github.com/cheqd/credential-service/commit/3f5e16bab1b2b8b2c937cb353692a2734a98dba3))
* Swagger UI fixes and other small tech debts [DEV-3121] ([#339](https://github.com/cheqd/credential-service/issues/339)) ([d7b3daa](https://github.com/cheqd/credential-service/commit/d7b3daa0e2f0d7b6958124c93099561b353a0f5d))


### Reverts

* LOGTO_MANAGEMENT_API config variable ([afdccbc](https://github.com/cheqd/credential-service/commit/afdccbc0e0eb2b7b1c8216b0b411017aa5973e48))

## [2.8.0-develop.4](https://github.com/cheqd/credential-service/compare/2.8.0-develop.3...2.8.0-develop.4) (2023-08-15)

### Bug Fixes

* Faucet setup configuration variables [DEV-3135] ([#342](https://github.com/cheqd/credential-service/issues/342)) ([eb7feac](https://github.com/cheqd/credential-service/commit/eb7feac647e96bf1a5fab79bbbc891e4007539cc))

## [2.8.0-develop.3](https://github.com/cheqd/credential-service/compare/2.8.0-develop.2...2.8.0-develop.3) (2023-08-15)


### Bug Fixes

* Added base reference syntax + error handling [DEV-3127] ([#338](https://github.com/cheqd/credential-service/issues/338)) ([4b6048d](https://github.com/cheqd/credential-service/commit/4b6048d0029b0f25eeb838e845923af5ef252a7a))

## [2.8.0-develop.2](https://github.com/cheqd/credential-service/compare/2.8.0-develop.1...2.8.0-develop.2) (2023-08-14)


### Bug Fixes

* Swagger UI fixes and other small tech debts [DEV-3121] ([#339](https://github.com/cheqd/credential-service/issues/339)) ([d7b3daa](https://github.com/cheqd/credential-service/commit/d7b3daa0e2f0d7b6958124c93099561b353a0f5d))

## [2.8.0-develop.1](https://github.com/cheqd/credential-service/compare/2.7.0...2.8.0-develop.1) (2023-08-10)

### Features

* Account bootstrapping [DEV-3051] ([#306](https://github.com/cheqd/credential-service/issues/306)) ([d157535](https://github.com/cheqd/credential-service/commit/d15753545d0b90d499e083ea6219bf28f97913ff))
* Remove `DEFAULT_CUSTOMER_ID` [DEV-2851] ([#318](https://github.com/cheqd/credential-service/issues/318)) ([c072af6](https://github.com/cheqd/credential-service/commit/c072af6a96ac5485e54b976753fa48f852fd8354))

### Bug Fixes

* Add data reset before each check ([#326](https://github.com/cheqd/credential-service/issues/326)) ([659a120](https://github.com/cheqd/credential-service/commit/659a120e5dd6221d32b0132802c381ca819860a0))
* Add M2M token refreshing [DEV-3117] ([#327](https://github.com/cheqd/credential-service/issues/327)) ([be04d92](https://github.com/cheqd/credential-service/commit/be04d928669fe1637c9bea795566bbcb80c61360))
* Cleanups ([#314](https://github.com/cheqd/credential-service/issues/314)) ([3b8e4ad](https://github.com/cheqd/credential-service/commit/3b8e4adaa3154ce4df793d14777be978b05a91e9))
* Cleanups [DEV-3050] ([#307](https://github.com/cheqd/credential-service/issues/307)) ([2e6b969](https://github.com/cheqd/credential-service/commit/2e6b9699203b8e013bf5e36a03a396d4a0bc649e))
* Fix auth button ([#324](https://github.com/cheqd/credential-service/issues/324)) ([3f88668](https://github.com/cheqd/credential-service/commit/3f8866847b0a90534a80a0a131604cb148c8b701))
* Implement dynamic login/logout button based on user's logged in state [DEV-3092] ([#316](https://github.com/cheqd/credential-service/issues/316)) ([4a2e40d](https://github.com/cheqd/credential-service/commit/4a2e40d685d3ed7b3a69298f8fd4dbc5b6d82f2c))
* Move to using scopes correctly from LogTo [DEV-3090] ([#317](https://github.com/cheqd/credential-service/issues/317)) ([3f5e16b](https://github.com/cheqd/credential-service/commit/3f5e16bab1b2b8b2c937cb353692a2734a98dba3))

## [2.7.1](https://github.com/cheqd/credential-service/compare/2.7.0...2.7.1) (2023-08-11)

### Bug Fixes

* Fix host in swagger.json for gitbook displaying [DEV-3122] ([#332](https://github.com/cheqd/credential-service/issues/332)) ([b99873d](https://github.com/cheqd/credential-service/commit/b99873d2485ce90f84fcf18246b83528b4437bc3))

## [2.7.0](https://github.com/cheqd/credential-service/compare/2.6.3...2.7.0) (2023-08-10)

## [2.7.0-develop.6](https://github.com/cheqd/credential-service/compare/2.7.0-develop.5...2.7.0-develop.6) (2023-08-10)

### Features

* Account bootstrapping [DEV-3051] ([#306](https://github.com/cheqd/credential-service/issues/306)) ([d157535](https://github.com/cheqd/credential-service/commit/d15753545d0b90d499e083ea6219bf28f97913ff))

## [2.7.0-develop.5](https://github.com/cheqd/credential-service/compare/2.7.0-develop.4...2.7.0-develop.5) (2023-08-10)

### Bug Fixes

* Add M2M token refreshing [DEV-3117] ([#327](https://github.com/cheqd/credential-service/issues/327))
    ([be04d92](https://github.com/cheqd/credential-service/commit/be04d928669fe1637c9bea795566bbcb80c61360))

## [2.7.0-develop.4](https://github.com/cheqd/credential-service/compare/2.7.0-develop.3...2.7.0-develop.4) (2023-08-09)

### Bug Fixes

* Add data reset before each check ([#326](https://github.com/cheqd/credential-service/issues/326))
    ([659a120](https://github.com/cheqd/credential-service/commit/659a120e5dd6221d32b0132802c381ca819860a0))

## [2.7.0-develop.3](https://github.com/cheqd/credential-service/compare/2.7.0-develop.2...2.7.0-develop.3) (2023-08-07)

### Bug Fixes

* Fix auth button ([#324](https://github.com/cheqd/credential-service/issues/324))
    ([3f88668](https://github.com/cheqd/credential-service/commit/3f8866847b0a90534a80a0a131604cb148c8b701))

## [2.7.0-develop.2](https://github.com/cheqd/credential-service/compare/2.7.0-develop.1...2.7.0-develop.2) (2023-08-07)

### Bug Fixes

* Implement dynamic login/logout button based on user's logged in state [DEV-3092]
    ([#316](https://github.com/cheqd/credential-service/issues/316))
    ([4a2e40d](https://github.com/cheqd/credential-service/commit/4a2e40d685d3ed7b3a69298f8fd4dbc5b6d82f2c))
* Move to using scopes correctly from LogTo [DEV-3090]
    ([#317](https://github.com/cheqd/credential-service/issues/317))
    ([3f5e16b](https://github.com/cheqd/credential-service/commit/3f5e16bab1b2b8b2c937cb353692a2734a98dba3))

## [2.7.0-develop.1](https://github.com/cheqd/credential-service/compare/2.6.4-develop.1...2.7.0-develop.1) (2023-08-04)

### Features

* Remove `DEFAULT_CUSTOMER_ID` [DEV-2851] ([#318](https://github.com/cheqd/credential-service/issues/318))
    ([c072af6](https://github.com/cheqd/credential-service/commit/c072af6a96ac5485e54b976753fa48f852fd8354))

## [2.6.4-develop.1](https://github.com/cheqd/credential-service/compare/2.6.3...2.6.4-develop.1) (2023-08-02)

### Bug Fixes

* Cleanups ([#314](https://github.com/cheqd/credential-service/issues/314))
    ([3b8e4ad](https://github.com/cheqd/credential-service/commit/3b8e4adaa3154ce4df793d14777be978b05a91e9))
* Cleanups [DEV-3050] ([#307](https://github.com/cheqd/credential-service/issues/307))
    ([2e6b969](https://github.com/cheqd/credential-service/commit/2e6b9699203b8e013bf5e36a03a396d4a0bc649e))

## [2.6.3-develop.2](https://github.com/cheqd/credential-service/compare/2.6.3-develop.1...2.6.3-develop.2) (2023-08-02)

* Add host and schemes sections into swagger.json ([#328](https://github.com/cheqd/credential-service/issues/328)) ([9022ec1](https://github.com/cheqd/credential-service/commit/9022ec153fce2162487e660eb8159002f4a7244c))

## [2.6.3](https://github.com/cheqd/credential-service/compare/2.6.2...2.6.3) (2023-08-01)

### Bug Fixes

* Cleanups ([#314](https://github.com/cheqd/credential-service/issues/314))
    ([3b8e4ad](https://github.com/cheqd/credential-service/commit/3b8e4adaa3154ce4df793d14777be978b05a91e9))
* Fix status update swagger ([#313](https://github.com/cheqd/credential-service/issues/313))
    ([4468c5f](https://github.com/cheqd/credential-service/commit/4468c5fb6078acbbd66a362f7939f3f4209b3e1a))

## [2.6.3-develop.1](https://github.com/cheqd/credential-service/compare/2.6.2...2.6.3-develop.1) (2023-08-01)

### Bug Fixes

* Cleanups [DEV-3050] ([#307](https://github.com/cheqd/credential-service/issues/307))
    ([2e6b969](https://github.com/cheqd/credential-service/commit/2e6b9699203b8e013bf5e36a03a396d4a0bc649e))

## [2.6.2](https://github.com/cheqd/credential-service/compare/2.6.1...2.6.2) (2023-07-25)

### Bug Fixes

* Cleanups ([#305](https://github.com/cheqd/credential-service/issues/305))
    ([988fb58](https://github.com/cheqd/credential-service/commit/988fb58025b647587e11c5268f1911513b28e400))
* Fix chain of responsibility setting up [DEV-3047] ([#303](https://github.com/cheqd/credential-service/issues/303))
    ([6312601](https://github.com/cheqd/credential-service/commit/6312601a98439882853a181b2b0420f9211f91fc))
* Fix verifyCredential && resolve function ([#304](https://github.com/cheqd/credential-service/issues/304))
    ([bcafb54](https://github.com/cheqd/credential-service/commit/bcafb54d182094fad092a51b2248e9fcfc899d6b))

## [2.6.1](https://github.com/cheqd/credential-service/compare/2.6.0...2.6.1) (2023-07-19)

## [2.6.1-develop.4](https://github.com/cheqd/credential-service/compare/2.6.1-develop.3...2.6.1-develop.4) (2023-07-25)

### Bug Fixes

* Fix issue with broken webhook being used for setting default user role in LogTo [DEV-2962]
    ([#298](https://github.com/cheqd/credential-service/issues/298))
    ([1d58103](https://github.com/cheqd/credential-service/commit/1d581034958c98ad64b3aef3d755db27301865c6))
* Cleanups ([#305](https://github.com/cheqd/credential-service/issues/305))
    ([988fb58](https://github.com/cheqd/credential-service/commit/988fb58025b647587e11c5268f1911513b28e400))

## [2.6.1-develop.3](https://github.com/cheqd/credential-service/compare/2.6.1-develop.2...2.6.1-develop.3) (2023-07-25)

### Bug Fixes

* Fix verifyCredential && resolve function ([#304](https://github.com/cheqd/credential-service/issues/304))
    ([bcafb54](https://github.com/cheqd/credential-service/commit/bcafb54d182094fad092a51b2248e9fcfc899d6b))

## [2.6.1-develop.2](https://github.com/cheqd/credential-service/compare/2.6.1-develop.1...2.6.1-develop.2) (2023-07-24)

### Bug Fixes

* Fix chain of responsibility setting up [DEV-3047] ([#303](https://github.com/cheqd/credential-service/issues/303))
    ([6312601](https://github.com/cheqd/credential-service/commit/6312601a98439882853a181b2b0420f9211f91fc))

## [2.6.1-develop.1](https://github.com/cheqd/credential-service/compare/2.6.0...2.6.1-develop.1) (2023-07-17)

### Bug Fixes

* Fix issue with broken webhook being used for setting default user role in LogTo [DEV-2962]
    ([#298](https://github.com/cheqd/credential-service/issues/298))
    ([1d58103](https://github.com/cheqd/credential-service/commit/1d581034958c98ad64b3aef3d755db27301865c6))

## [2.6.0](https://github.com/cheqd/credential-service/compare/2.5.0...2.6.0) (2023-07-13)

### Features

* Generate Swagger docs automatically using semantic release [DEV-2773]
    ([#292](https://github.com/cheqd/credential-service/issues/292))
    ([38441d0](https://github.com/cheqd/credential-service/commit/38441d06617963a3350021bbe899f6f24342a3b3))

## [2.6.0-develop.1](https://github.com/cheqd/credential-service/compare/2.5.0...2.6.0-develop.1) (2023-07-13)

### Features

* Generate Swagger docs automatically using semantic release [DEV-2773]
    ([#292](https://github.com/cheqd/credential-service/issues/292))
    ([38441d0](https://github.com/cheqd/credential-service/commit/38441d06617963a3350021bbe899f6f24342a3b3))

## [2.5.0](https://github.com/cheqd/credential-service/compare/2.4.1...2.5.0) (2023-07-11)

### Features

* Add credential-status check API [DEV-2940] ([#293](https://github.com/cheqd/credential-service/issues/293))
    ([34ad827](https://github.com/cheqd/credential-service/commit/34ad82732d5bb411903c29f385e694d58c72d958))
* Add Default role assigning while creating and account or signing in [DEV-2905]
    ([#286](https://github.com/cheqd/credential-service/issues/286))
    ([c99bed2](https://github.com/cheqd/credential-service/commit/c99bed205cd2821e5ff14d76a4f78f160faeb967))
* Add verify presentation API and update StatusList APIs [DEV-2811] & [DEV-2669]
    ([#265](https://github.com/cheqd/credential-service/issues/265))
    ([4e43430](https://github.com/cheqd/credential-service/commit/4e43430c221a5e6029f446a6a6bca1617745ab53))

### Bug Fixes

* Add policies to Verification API [DEV-2951] ([#294](https://github.com/cheqd/credential-service/issues/294))
    ([d3c6ea9](https://github.com/cheqd/credential-service/commit/d3c6ea91a6319ab8ba7b1bfd65b9c553063624e8))
* Fix issue with broken webhook being used for setting default user role in LogTo [DEV-2962]
    ([#295](https://github.com/cheqd/credential-service/issues/295))
    ([a3c8fde](https://github.com/cheqd/credential-service/commit/a3c8fde62d9b3c75d6e8efefd49bbd1d1fd6d6a0))

## [2.5.0-develop.1](https://github.com/cheqd/credential-service/compare/2.4.1...2.5.0-develop.1) (2023-07-11)

### Features

* Add credential-status check API [DEV-2940] ([#293](https://github.com/cheqd/credential-service/issues/293))
    ([34ad827](https://github.com/cheqd/credential-service/commit/34ad82732d5bb411903c29f385e694d58c72d958))
* Add Default role assigning while creating and account or signing in [DEV-2905]
    ([#286](https://github.com/cheqd/credential-service/issues/286))
    ([c99bed2](https://github.com/cheqd/credential-service/commit/c99bed205cd2821e5ff14d76a4f78f160faeb967))
* Add verify presentation API and update StatusList APIs [DEV-2811] & [DEV-2669]
    ([#265](https://github.com/cheqd/credential-service/issues/265))
    ([4e43430](https://github.com/cheqd/credential-service/commit/4e43430c221a5e6029f446a6a6bca1617745ab53))

### Bug Fixes

* Add policies to Verification API [DEV-2951] ([#294](https://github.com/cheqd/credential-service/issues/294))
    ([d3c6ea9](https://github.com/cheqd/credential-service/commit/d3c6ea91a6319ab8ba7b1bfd65b9c553063624e8))
* Fix issue with broken webhook being used for setting default user role in LogTo [DEV-2962]
    ([#295](https://github.com/cheqd/credential-service/issues/295))
    ([a3c8fde](https://github.com/cheqd/credential-service/commit/a3c8fde62d9b3c75d6e8efefd49bbd1d1fd6d6a0))

## [2.4.0-develop.11](https://github.com/cheqd/credential-service/compare/2.4.0-develop.10...2.4.0-develop.11) (2023-07-11)

### Bug Fixes

* Fix issue with broken webhook being used for setting default user role in LogTo [DEV-2962]
    ([#295](https://github.com/cheqd/credential-service/issues/295))
    ([a3c8fde](https://github.com/cheqd/credential-service/commit/a3c8fde62d9b3c75d6e8efefd49bbd1d1fd6d6a0))

## [2.4.0-develop.10](https://github.com/cheqd/credential-service/compare/2.4.0-develop.9...2.4.0-develop.10) (2023-07-11)

### Features

* Add credential-status check API [DEV-2940] ([#293](https://github.com/cheqd/credential-service/issues/293))
    ([34ad827](https://github.com/cheqd/credential-service/commit/34ad82732d5bb411903c29f385e694d58c72d958))

## [2.4.0-develop.9](https://github.com/cheqd/credential-service/compare/2.4.0-develop.8...2.4.0-develop.9) (2023-07-11)

### Bug Fixes

* Add policies to Verification API [DEV-2951] ([#294](https://github.com/cheqd/credential-service/issues/294))
    ([d3c6ea9](https://github.com/cheqd/credential-service/commit/d3c6ea91a6319ab8ba7b1bfd65b9c553063624e8))

## [2.4.0-develop.8](https://github.com/cheqd/credential-service/compare/2.4.0-develop.7...2.4.0-develop.8) (2023-07-09)

### Features

* Add Default role assigning while creating and account or signing in [DEV-2905]
    ([#286](https://github.com/cheqd/credential-service/issues/286))
    ([c99bed2](https://github.com/cheqd/credential-service/commit/c99bed205cd2821e5ff14d76a4f78f160faeb967))

## [2.4.0-develop.7](https://github.com/cheqd/credential-service/compare/2.4.0-develop.6...2.4.0-develop.7) (2023-07-07)

### Features

* Add verify presentation API and update StatusList APIs [DEV-2811] & [DEV-2669]
    ([#265](https://github.com/cheqd/credential-service/issues/265))
    ([4e43430](https://github.com/cheqd/credential-service/commit/4e43430c221a5e6029f446a6a6bca1617745ab53))

## [2.4.0-develop.6](https://github.com/cheqd/credential-service/compare/2.4.0-develop.5...2.4.0-develop.6) (2023-07-06)

## [2.4.0-develop.5](https://github.com/cheqd/credential-service/compare/2.4.0-develop.4...2.4.0-develop.5) (2023-07-03)

## [2.4.1](https://github.com/cheqd/credential-service/compare/2.4.0...2.4.1) (2023-06-30)

### Bug Fixes

* Fix building image for release
    ([2352114](https://github.com/cheqd/credential-service/commit/2352114e191499ffbc37e456ab8539c2f7fbbcb3))

## [2.4.0](https://github.com/cheqd/credential-service/compare/2.3.1...2.4.0) (2023-06-29)

### Features

* Add "authenticated" user roles and permissions, and amend API definitions [DEV-2684]
    ([#267](https://github.com/cheqd/credential-service/issues/267))
    ([2a6b30f](https://github.com/cheqd/credential-service/commit/2a6b30f93dba29f1738f298e535303437a9a1971))

### Bug Fixes

* Fix bug where credential-service expects config variables with authentication and external DB disabled [DEV-2843]
    ([#276](https://github.com/cheqd/credential-service/issues/276))
    ([4008bdf](https://github.com/cheqd/credential-service/commit/4008bdfcc0e372af4b31a914e121c561da3ed63c))
* Fix for the order of auth handlers ([#275](https://github.com/cheqd/credential-service/issues/275))
    ([6d3bb77](https://github.com/cheqd/credential-service/commit/6d3bb778c7e9884e66058941431da9a898025333))
* Fix local storage instantiating ([#269](https://github.com/cheqd/credential-service/issues/269))
    ([6ec820f](https://github.com/cheqd/credential-service/commit/6ec820f83c6d1c9b0a34e0bde10bcec25a51c5ef))

## [2.4.0-develop.4](https://github.com/cheqd/credential-service/compare/2.4.0-develop.3...2.4.0-develop.4) (2023-06-28)

## [2.4.0-develop.3](https://github.com/cheqd/credential-service/compare/2.4.0-develop.2...2.4.0-develop.3) (2023-06-27)

### Bug Fixes

* Fix bug where credential-service expects config variables with authentication and external DB disabled [DEV-2843]
    ([#276](https://github.com/cheqd/credential-service/issues/276))
    ([4008bdf](https://github.com/cheqd/credential-service/commit/4008bdfcc0e372af4b31a914e121c561da3ed63c))

## [2.4.0-develop.2](https://github.com/cheqd/credential-service/compare/2.4.0-develop.1...2.4.0-develop.2) (2023-06-26)

### Bug Fixes

* Fix for the order of auth handlers ([#275](https://github.com/cheqd/credential-service/issues/275))
    ([6d3bb77](https://github.com/cheqd/credential-service/commit/6d3bb778c7e9884e66058941431da9a898025333))

## [2.4.0-develop.1](https://github.com/cheqd/credential-service/compare/2.3.2-develop.2...2.4.0-develop.1) (2023-06-26)

### Features

* Add "authenticated" user roles and permissions, and amend API definitions [DEV-2684]
    ([#267](https://github.com/cheqd/credential-service/issues/267))
    ([2a6b30f](https://github.com/cheqd/credential-service/commit/2a6b30f93dba29f1738f298e535303437a9a1971))

## [2.3.2-develop.2](https://github.com/cheqd/credential-service/compare/2.3.2-develop.1...2.3.2-develop.2) (2023-06-24)

### Bug Fixes

* Fix local storage instantiating ([#269](https://github.com/cheqd/credential-service/issues/269))
    ([6ec820f](https://github.com/cheqd/credential-service/commit/6ec820f83c6d1c9b0a34e0bde10bcec25a51c5ef))

## [2.3.2-develop.1](https://github.com/cheqd/credential-service/compare/2.3.1...2.3.2-develop.1) (2023-06-22)

## [2.3.1](https://github.com/cheqd/credential-service/compare/2.3.0...2.3.1) (2023-06-22)

## [2.3.0](https://github.com/cheqd/credential-service/compare/2.2.0...2.3.0) (2023-06-13)

### Features

* Add API guarding [DEV-2621] ([#249](https://github.com/cheqd/credential-service/issues/249))
    ([3706b4c](https://github.com/cheqd/credential-service/commit/3706b4c63006be4282cfeed530c2d15f44da4164)), closes
    [#2](https://github.com/cheqd/credential-service/issues/2)
* Add credentialSchema attribute ([#262](https://github.com/cheqd/credential-service/issues/262))
    ([0e4268a](https://github.com/cheqd/credential-service/commit/0e4268aaf70f85d803512177d59b28db4f7cff9d))
* Add support issue verify & revoke credentials [DEV-2669]
    ([#255](https://github.com/cheqd/credential-service/issues/255))
    ([c69df47](https://github.com/cheqd/credential-service/commit/c69df47960ad6f8e7716215c6a05c7611e0b668e))

### Bug Fixes

* Copy static files to the dist while building ([#253](https://github.com/cheqd/credential-service/issues/253))
    ([4f076c0](https://github.com/cheqd/credential-service/commit/4f076c0f62bd8ee6e32f1e97bf6c8b724ff3393f))
* Fix static files copying ([#254](https://github.com/cheqd/credential-service/issues/254))
    ([1ea85d3](https://github.com/cheqd/credential-service/commit/1ea85d3f1d1cb290a8304269da1ba8a6219572e9))
* Move custom_button.js script into static root ([#261](https://github.com/cheqd/credential-service/issues/261))
    ([8544020](https://github.com/cheqd/credential-service/commit/8544020c586c147bf64824665bbba4d4eba9a991))
* One more attempt to fix static files ([#260](https://github.com/cheqd/credential-service/issues/260))
    ([abaed7a](https://github.com/cheqd/credential-service/commit/abaed7a7c2d7d2a18ecfe8bfcc77bb4647b3efe6))
* Static files for swagger ([#259](https://github.com/cheqd/credential-service/issues/259))
    ([a1fe566](https://github.com/cheqd/credential-service/commit/a1fe566c42ede1cd8bc08a9b8f142f35b153f7b6))

## [2.2.0](https://github.com/cheqd/credential-service/compare/2.1.1...2.2.0) (2023-06-08)

### Features

* Implement USE_EXTERNAL_DB toggle [DEV 2630] ([#233](https://github.com/cheqd/credential-service/issues/233))
    ([a023242](https://github.com/cheqd/credential-service/commit/a02324284de8882447a1eb7c2c246d1f6e3a40b9))

### Bug Fixes

* External db toggle panic ([#248](https://github.com/cheqd/credential-service/issues/248))
    ([a33cd25](https://github.com/cheqd/credential-service/commit/a33cd25b7aa17972afd83c64937ed571f4bf1e2b))

## [2.1.1](https://github.com/cheqd/credential-service/compare/2.1.0...2.1.1) (2023-06-05)

### Bug Fixes

* Get string env variables back ([#246](https://github.com/cheqd/credential-service/issues/246))
    ([1f6439b](https://github.com/cheqd/credential-service/commit/1f6439b5a3777725c2866d6653dc5842a74926bf))
* Restructure environment variables / configuration parameters [DEV-2758]
    ([#240](https://github.com/cheqd/credential-service/issues/240))
    ([b206958](https://github.com/cheqd/credential-service/commit/b20695851e2c3b4d16cfd22c59dfdfe4123e333b))

## [2.1.0](https://github.com/cheqd/credential-service/compare/2.0.0...2.1.0) (2023-06-01)

### Features

* [DEV-2619] Create workspace with frontend and backend packages
    ([#212](https://github.com/cheqd/credential-service/issues/212))
    ([08e6a45](https://github.com/cheqd/credential-service/commit/08e6a45e79243691879304fc061917a0458daacb)), closes
    [#211](https://github.com/cheqd/credential-service/issues/211)
    [#194](https://github.com/cheqd/credential-service/issues/194)
    [#193](https://github.com/cheqd/credential-service/issues/193)
* Add auth toggle && missing api's ([#234](https://github.com/cheqd/credential-service/issues/234))
    ([5c44288](https://github.com/cheqd/credential-service/commit/5c44288dd3726d5f38828126641d1476f9d0a897))
* Add verida connector ([#227](https://github.com/cheqd/credential-service/issues/227))
    ([c1ac128](https://github.com/cheqd/credential-service/commit/c1ac128220f45d98530913a8fbd89c30f88083d1))
* Switch back to backend only, split front-end to own repo [DEV-2665]
    ([#221](https://github.com/cheqd/credential-service/issues/221))
    ([168608a](https://github.com/cheqd/credential-service/commit/168608a67dc53bbb598e805db4d67bb65b12f06a))
* Update .envs ([#238](https://github.com/cheqd/credential-service/issues/238))
    ([ce0e57b](https://github.com/cheqd/credential-service/commit/ce0e57baad5712c879f88a548d2f08c4d6c010d7))
* Update refactor verida
    ([6194a28](https://github.com/cheqd/credential-service/commit/6194a28a6e131f123598b70019ccff968115454d))

### Bug Fixes

* Dockerfile command
    ([5d4defb](https://github.com/cheqd/credential-service/commit/5d4defb19b21c11b21b38453a49a1b282fd20bfc))
* Dockerfile permission && credential verification [CU-85zt6ng2p]
    ([#239](https://github.com/cheqd/credential-service/issues/239))
    ([45bb6d7](https://github.com/cheqd/credential-service/commit/45bb6d785a6552bfdee51124d0ca8d71f2e51c9a))
* Jsonld credentials ([#236](https://github.com/cheqd/credential-service/issues/236))
    ([c56a0a0](https://github.com/cheqd/credential-service/commit/c56a0a07cfcb4999cf0e40094dfe58b0a1b16712))
* Minor issues && swagger ([#235](https://github.com/cheqd/credential-service/issues/235))
    ([51d2790](https://github.com/cheqd/credential-service/commit/51d2790712b7470e46dceb97743da5e2ed5c2420))
* Update Dockerfile variables and Swagger generation ([#228](https://github.com/cheqd/credential-service/issues/228))
    ([f659754](https://github.com/cheqd/credential-service/commit/f659754bc0930d5118fac0e9d26d0f34f9fbae14))
* Get string env variables back ([#246](https://github.com/cheqd/credential-service/issues/246))
    ([1f6439b](https://github.com/cheqd/credential-service/commit/1f6439b5a3777725c2866d6653dc5842a74926bf))

## [2.1.0-develop.14](https://github.com/cheqd/credential-service/compare/2.1.0-develop.13...2.1.0-develop.14) (2023-06-05)

### Bug Fixes

* Restructure environment variables / configuration parameters [DEV-2758]
    ([#240](https://github.com/cheqd/credential-service/issues/240))
    ([b206958](https://github.com/cheqd/credential-service/commit/b20695851e2c3b4d16cfd22c59dfdfe4123e333b))

## [2.1.0-develop.13](https://github.com/cheqd/credential-service/compare/2.1.0-develop.12...2.1.0-develop.13) (2023-06-01)

### Bug Fixes

* Dockerfile permission && credential verification [CU-85zt6ng2p]
    ([#239](https://github.com/cheqd/credential-service/issues/239))
    ([45bb6d7](https://github.com/cheqd/credential-service/commit/45bb6d785a6552bfdee51124d0ca8d71f2e51c9a))

## [2.1.0-develop.12](https://github.com/cheqd/credential-service/compare/2.1.0-develop.11...2.1.0-develop.12) (2023-05-31)

## [2.1.0-develop.11](https://github.com/cheqd/credential-service/compare/2.1.0-develop.10...2.1.0-develop.11) (2023-05-31)

### Features

* Update .envs ([#238](https://github.com/cheqd/credential-service/issues/238))
    ([ce0e57b](https://github.com/cheqd/credential-service/commit/ce0e57baad5712c879f88a548d2f08c4d6c010d7))

## [2.1.0-develop.10](https://github.com/cheqd/credential-service/compare/2.1.0-develop.9...2.1.0-develop.10) (2023-05-31)

### Bug Fixes

* Jsonld credentials ([#236](https://github.com/cheqd/credential-service/issues/236))
    ([c56a0a0](https://github.com/cheqd/credential-service/commit/c56a0a07cfcb4999cf0e40094dfe58b0a1b16712))

## [2.1.0-develop.9](https://github.com/cheqd/credential-service/compare/2.1.0-develop.8...2.1.0-develop.9) (2023-05-30)

### Bug Fixes

* Minor issues && swagger ([#235](https://github.com/cheqd/credential-service/issues/235))
    ([51d2790](https://github.com/cheqd/credential-service/commit/51d2790712b7470e46dceb97743da5e2ed5c2420))

## [2.1.0-develop.8](https://github.com/cheqd/credential-service/compare/2.1.0-develop.7...2.1.0-develop.8) (2023-05-30)

### Features

* Add auth toggle && missing api's ([#234](https://github.com/cheqd/credential-service/issues/234))
    ([5c44288](https://github.com/cheqd/credential-service/commit/5c44288dd3726d5f38828126641d1476f9d0a897))

## [2.1.0-develop.7](https://github.com/cheqd/credential-service/compare/2.1.0-develop.6...2.1.0-develop.7) (2023-05-26)

### Features

* Update refactor verida
    ([6194a28](https://github.com/cheqd/credential-service/commit/6194a28a6e131f123598b70019ccff968115454d))

## [2.1.0-develop.6](https://github.com/cheqd/credential-service/compare/2.1.0-develop.5...2.1.0-develop.6) (2023-05-25)

### Bug Fixes

* Update Dockerfile variables and Swagger generation ([#228](https://github.com/cheqd/credential-service/issues/228))
    ([f659754](https://github.com/cheqd/credential-service/commit/f659754bc0930d5118fac0e9d26d0f34f9fbae14))

## [2.1.0-develop.5](https://github.com/cheqd/credential-service/compare/2.1.0-develop.4...2.1.0-develop.5) (2023-05-25)

### Features

* Add verida connector ([#227](https://github.com/cheqd/credential-service/issues/227))
    ([c1ac128](https://github.com/cheqd/credential-service/commit/c1ac128220f45d98530913a8fbd89c30f88083d1))

## [2.1.0-develop.4](https://github.com/cheqd/credential-service/compare/2.1.0-develop.3...2.1.0-develop.4) (2023-05-25)

### Bug Fixes

* Dockerfile command
    ([5d4defb](https://github.com/cheqd/credential-service/commit/5d4defb19b21c11b21b38453a49a1b282fd20bfc))

## [2.1.0-develop.3](https://github.com/cheqd/credential-service/compare/2.1.0-develop.2...2.1.0-develop.3) (2023-05-25)

## [2.1.0-develop.2](https://github.com/cheqd/credential-service/compare/2.1.0-develop.1...2.1.0-develop.2) (2023-05-24)

### Features

* Switch back to backend only, split front-end to own repo [DEV-2665]
    ([#221](https://github.com/cheqd/credential-service/issues/221))
    ([168608a](https://github.com/cheqd/credential-service/commit/168608a67dc53bbb598e805db4d67bb65b12f06a))

## [2.1.0-develop.1](https://github.com/cheqd/credential-service/compare/2.0.0...2.1.0-develop.1) (2023-05-24)

### Features

* [DEV-2619] Create workspace with frontend and backend packages
    ([#212](https://github.com/cheqd/credential-service/issues/212))
    ([08e6a45](https://github.com/cheqd/credential-service/commit/08e6a45e79243691879304fc061917a0458daacb)), closes
    [#211](https://github.com/cheqd/credential-service/issues/211)
    [#194](https://github.com/cheqd/credential-service/issues/194)
    [#193](https://github.com/cheqd/credential-service/issues/193)

## [2.0.0](https://github.com/cheqd/credential-service/compare/1.5.1...2.0.0) (2023-04-03)

### ⚠ BREAKING CHANGES

* Add Microservice (#181)

### Features

* Add Microservice ([#181](https://github.com/cheqd/credential-service/issues/181))
    ([b08d460](https://github.com/cheqd/credential-service/commit/b08d46050ea7d4b8ab0ea928bd1b06864a5db7ee))
* Add swagger ([#189](https://github.com/cheqd/credential-service/issues/189))
    ([3c3ef1b](https://github.com/cheqd/credential-service/commit/3c3ef1b06b111169730e61beddf7174b5eabc4ae))

## [2.0.0-develop.3](https://github.com/cheqd/credential-service/compare/2.0.0-develop.2...2.0.0-develop.3) (2023-04-03)

## [2.0.0-develop.2](https://github.com/cheqd/credential-service/compare/2.0.0-develop.1...2.0.0-develop.2) (2023-03-22)

### Features

* Add swagger ([#189](https://github.com/cheqd/credential-service/issues/189))
    ([3c3ef1b](https://github.com/cheqd/credential-service/commit/3c3ef1b06b111169730e61beddf7174b5eabc4ae))

## [2.0.0-develop.1](https://github.com/cheqd/credential-service/compare/1.5.1-develop.1...2.0.0-develop.1) (2023-03-17)

### ⚠ BREAKING CHANGES

* Add Microservice (#181)

### Features

* Add Microservice ([#181](https://github.com/cheqd/credential-service/issues/181))
    ([b08d460](https://github.com/cheqd/credential-service/commit/b08d46050ea7d4b8ab0ea928bd1b06864a5db7ee))

## [1.5.1-develop.1](https://github.com/cheqd/credential-service/compare/1.5.0...1.5.1-develop.1) (2023-03-17)

## [1.5.1](https://github.com/cheqd/credential-service/compare/1.5.0...1.5.1) (2023-03-17)

## [1.5.0](https://github.com/cheqd/credential-service/compare/1.4.4...1.5.0) (2023-03-17)

### Features

* Add Express router ([#175](https://github.com/cheqd/credential-service/issues/175))
    ([4b4f01e](https://github.com/cheqd/credential-service/commit/4b4f01e9395dd6d15e073dc6496de08c6797098e))
* Update refactor code ([#177](https://github.com/cheqd/credential-service/issues/177))
    ([fed4b28](https://github.com/cheqd/credential-service/commit/fed4b283daa065f3bc11b70d9070819238de09db))

## [1.5.0-develop.4](https://github.com/cheqd/credential-service/compare/1.5.0-develop.3...1.5.0-develop.4) (2023-03-17)

## [1.5.0-develop.3](https://github.com/cheqd/credential-service/compare/1.5.0-develop.2...1.5.0-develop.3) (2023-03-17)

### Features

* Update refactor code ([#177](https://github.com/cheqd/credential-service/issues/177))
    ([fed4b28](https://github.com/cheqd/credential-service/commit/fed4b283daa065f3bc11b70d9070819238de09db))

## [1.5.0-develop.2](https://github.com/cheqd/credential-service/compare/1.5.0-develop.1...1.5.0-develop.2) (2023-03-16)

## [1.5.0-develop.1](https://github.com/cheqd/credential-service/compare/1.4.5-develop.2...1.5.0-develop.1) (2023-03-16)

### Features

* Add Express router ([#175](https://github.com/cheqd/credential-service/issues/175))
    ([4b4f01e](https://github.com/cheqd/credential-service/commit/4b4f01e9395dd6d15e073dc6496de08c6797098e))

## [1.4.5-develop.2](https://github.com/cheqd/credential-service/compare/1.4.5-develop.1...1.4.5-develop.2) (2023-02-10)

## [1.4.5-develop.1](https://github.com/cheqd/credential-service/compare/1.4.4...1.4.5-develop.1) (2023-02-08)

## [1.4.4](https://github.com/cheqd/credential-service/compare/1.4.3...1.4.4) (2022-12-14)

## [1.4.3](https://github.com/cheqd/credential-service/compare/1.4.2...1.4.3) (2022-11-17)

### Bug Fixes

* Add Logos as resources in Webpage and Ticket ([#105](https://github.com/cheqd/credential-service/issues/105))
    ([f140684](https://github.com/cheqd/credential-service/commit/f140684faadf328a915d53b1127335ce00e81ad8))

## [1.4.2](https://github.com/cheqd/credential-service/compare/1.4.1...1.4.2) (2022-11-16)

## [1.4.1](https://github.com/cheqd/credential-service/compare/1.4.0...1.4.1) (2022-11-16)

### Bug Fixes

* Logo url ([0aad2fb](https://github.com/cheqd/credential-service/commit/0aad2fb9f2dad91f146352ceb2d4554c15f617d6))
* Logo url ([#103](https://github.com/cheqd/credential-service/issues/103))
    ([2fa9496](https://github.com/cheqd/credential-service/commit/2fa949610268fcab1177ac5a2e18d35d6b407d7d))

## [1.4.0](https://github.com/cheqd/credential-service/compare/1.3.0...1.4.0) (2022-11-16)

### Features

* Add onLedger Resources
    ([a2030d5](https://github.com/cheqd/credential-service/commit/a2030d500b7274f2e96f8467325f1c8b69be6b63))
* Add onLedger Resources ([#102](https://github.com/cheqd/credential-service/issues/102))
    ([0800f90](https://github.com/cheqd/credential-service/commit/0800f90a5050e766459ad10a4b587266c676d11e))

## [1.3.0](https://github.com/cheqd/credential-service/compare/1.2.0...1.3.0) (2022-11-15)

### Features

* Remove social account for ticketCredential [DEV-1921]
    ([#100](https://github.com/cheqd/credential-service/issues/100))
    ([6d9cc66](https://github.com/cheqd/credential-service/commit/6d9cc66490c2bf49186d0c62c3b02fbd3917f83f))

## [1.2.0](https://github.com/cheqd/credential-service/compare/1.1.5...1.2.0) (2022-11-11)

### Features

* Add support for Person + Event credentials [DEV-1918] ([#86](https://github.com/cheqd/credential-service/issues/86))
    ([55c52c8](https://github.com/cheqd/credential-service/commit/55c52c89f59f12c3a30302acc0a149f8b21d1221))

## [1.1.5](https://github.com/cheqd/credential-service/compare/1.1.4...1.1.5) (2022-11-09)

## [1.1.4](https://github.com/cheqd/credential-service/compare/1.1.3...1.1.4) (2022-10-27)

### Bug Fixes

* **deploy:** Added node module resolution
    ([74234bb](https://github.com/cheqd/credential-service/commit/74234bbccba5a97864ae624a8b0758a9453b26e0))
* **deps:** Refactor deriving from bumps
    ([1fbcbfc](https://github.com/cheqd/credential-service/commit/1fbcbfc053842f8f451f6ebe0fab10b2053f18ca))

## [1.1.3](https://github.com/cheqd/credential-service/compare/1.1.2...1.1.3) (2022-10-14)

### Bug Fixes

* Environment variables issue [DEV-1806] ([#61](https://github.com/cheqd/credential-service/issues/61))
    ([9ea70f4](https://github.com/cheqd/credential-service/commit/9ea70f414f3f135e61207a24bab4f042d516575c))

## [1.1.2](https://github.com/cheqd/credential-service/compare/1.1.1...1.1.2) (2022-10-12)

### Bug Fixes

* **deps:** Bump eslint from 8.24.0 to 8.25.0
    ([d77a4b3](https://github.com/cheqd/credential-service/commit/d77a4b369bed844b7b17c014893953e3167030b5))

## [1.1.1](https://github.com/cheqd/credential-service/compare/1.1.0...1.1.1) (2022-10-12)

### Bug Fixes

* **deps:** Bump node from 16-alpine to 17-alpine
    ([bbb0547](https://github.com/cheqd/credential-service/commit/bbb0547cbf990b75330d05df55f2a5159370426d))
* **deps:** Bump node from 16-alpine to 17-alpine ([#60](https://github.com/cheqd/credential-service/issues/60))
    ([49d5dcd](https://github.com/cheqd/credential-service/commit/49d5dcd7b77a4dd822fa0ebd9ff061874b599696))

## [1.1.0](https://github.com/cheqd/credential-service/compare/1.0.0...1.1.0) (2022-10-07)

### Features

* Update build, publish, deploy system [DEV-1805] ([#38](https://github.com/cheqd/credential-service/issues/38))
    ([107da68](https://github.com/cheqd/credential-service/commit/107da68711f06e738f43d977227a610ace434bc5))
