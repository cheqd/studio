/**
 * @openapi
 *
 * components:
 *   schemas:
 *     AlsoKnownAs:
 *       type: object
 *       properties:
 *         alsoKnownAs:
 *           type: array
 *           description: Optional field to assign a set of alternative URIs where the DID-Linked Resource can be fetched from.
 *           items:
 *             type: object
 *             properties:
 *               uri:
 *                 type: string
 *                 format: uri
 *                 description: URI where the DID-Linked Resource can be fetched from. Can be any type of URI (e.g., DID, HTTPS, IPFS, etc.)
 *               description:
 *                 type: string
 *                 description: Optional description of the URI.
 *     CredentialRequest:
 *       description: Input fields for the creating a Verifiable Credential.
 *       type: object
 *       additionalProperties: false
 *       properties:
 *         issuerDid:
 *           description: DID of the Verifiable Credential issuer. This needs to be a `did:cheqd` DID.
 *           type: string
 *           example: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *         subjectDid:
 *           description: DID of the Verifiable Credential holder/subject. This needs to be a `did:key` DID.
 *           type: string
 *           example: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
 *         attributes:
 *           description: JSON object containing the attributes to be included in the credential.
 *           type: object
 *           example: {
 *              name: Bob,
 *              gender: male
 *           }
 *         '@context':
 *           description: Optional properties to be included in the `@context` property of the credential.
 *           type: array
 *           items:
 *             type: string
 *           example: [https://schema.org/schema.jsonld, https://veramo.io/contexts/profile/v1]
 *         type:
 *           description: Optional properties to be included in the `type` property of the credential.
 *           type: array
 *           items:
 *             type: string
 *           example: [Person]
 *         expirationDate:
 *           description: Optional expiration date according to the <a href=https://www.w3.org/TR/vc-data-model/#expiration> VC Data Model specification</a>.
 *           type: string
 *           format: date-time
 *           example: 2023-06-08T13:49:28.000Z
 *         format:
 *           description: Format of the Verifiable Credential. Defaults to VC-JWT.
 *           type: string
 *           enum:
 *             - jwt
 *             - lds
 *           example: jwt
 *         credentialStatus:
 *           description: Optional `credentialStatus` properties for VC revocation or suspension. Takes `statusListName` and `statusListPurpose` as inputs.
 *           type: object
 *           required:
 *             - statusPurpose
 *             - statusListName
 *           properties:
 *             statusPurpose:
 *               type: string
 *               enum:
 *                 - revocation
 *                 - suspension
 *             statusListName:
 *               type: string
 *             statusListIndex:
 *               type: number
 *             statusListVersion:
 *               type: string
 *               format: date-time
 *             statusListRangeStart:
 *               type: number
 *             statusListRangeEnd:
 *               type: number
 *             indexNotIn:
 *               type: number
 *           example:
 *             statusPurpose: revocation
 *             statusListName: employee-credentials
 *       required:
 *         - issuerDid
 *         - subjectDid
 *         - attributes
 *       example:
 *         issuerDid: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *         subjectDid: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
 *         attributes:
 *           gender: male
 *           name: Bob
 *         '@context':
 *           - https://schema.org
 *         type:
 *           - Person
 *         format: jwt
 *         credentialStatus:
 *           statusPurpose: revocation
 *           statusListName: employee-credentials
 *           statusListIndex: 10
 *     Credential:
 *       description: Input fields for revoking/suspending a Verifiable Credential.
 *       type: object
 *       additionalProperties: false
 *       properties:
 *         '@context':
 *           type: array
 *           items:
 *             type: string
 *           example: [https://www.w3.org/2018/credentials/v1, https://schema.org, https://veramo.io/contexts/profile/v1]
 *         type:
 *           type: array
 *           items:
 *             type: string
 *           example: [VerifiableCredential, Person]
 *         expirationDate:
 *           type: string
 *           format: date-time
 *           example: 2023-06-08T13:49:28.000Z
 *         issuer:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               format: DID
 *               example: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *         credentialSubject:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               format: DID
 *               example: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
 *         credentialStatus:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               example: https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e?resourceName=cheqd-suspension-1&resourceType=StatusList2021Suspension#20
 *             statusListIndex:
 *               type: number
 *               example: 20
 *             statusPurpose:
 *               type: string
 *               enum:
 *                 - revocation
 *                 - suspension
 *               example: suspension
 *             type:
 *               type: string
 *               enum:
 *                 - StatusList2021Entry
 *         issuanceDate:
 *           type: string
 *           format: date-time
 *           example: 2023-06-08T13:49:28.000Z
 *         proof:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *             jwt:
 *               type: string
 *           example: {
 *            type: JwtProof2020,
 *            jwt: eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkaWQ6Y2hlcWQ6dGVzdG5ldDo3YmY4MWEyMC02MzNjLTRjYzctYmM0YS01YTQ1ODAxMDA1ZTAiLCJuYmYiOjE2ODYyMzIxNjgsInN1YiI6ImRpZDprZXk6ejZNa2hhWGdCWkR2b3REa0w1MjU3ZmFpenRpR2lDMlF0S0xHcGJubkVHdGEyZG9LIiwidmMiOnsiQGNvbnRleHQiOlsiaHR0cHM6Ly93d3cudzMub3JnLzIwMTgvY3JlZGVudGlhbHMvdjEiLCJodHRwczovL3NjaGVtYS5vcmciLCJodHRwczovL3ZlcmFtby5pby9jb250ZXh0cy9wcm9maWxlL3YxIl0sImNyZWRlbnRpYWxTdWJqZWN0Ijp7ImdlbmRlciI6Im1hbGUiLCJuYW1lIjoiQm9iIn0sInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRpYWwiLCJQZXJzb24iXX19.wMfdR6RtyAZA4eoWya5Aw97wwER2Cm5Guk780Xw8H9fA3sfudIJeLRLboqixpTchqSbYeA7KbuCTAnLgXTD_Cg,
 *           }
 *       example:
 *         '@context':
 *           - https://www.w3.org/2018/credentials/v1
 *           - https://schema.org
 *           - https://veramo.io/contexts/profile/v1
 *         credentialSubject:
 *           gender: male
 *           id: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
 *           name: Bob
 *         credentialStatus:
 *           id: https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e?resourceName=cheqd-suspension-1&resourceType=StatusList2021Suspension#20
 *           statusIndex: 20
 *           statusPurpose: suspension
 *           type: StatusList2021Entry
 *         issuanceDate: 2023-06-08T13:49:28.000Z
 *         issuer:
 *           id: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *         proof:
 *           jwt: eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkaWQ6Y2hlcWQ6dGVzdG5ldDo3YmY4MWEyMC02MzNjLTRjYzctYmM0YS01YTQ1ODAxMDA1ZTAiLCJuYmYiOjE2ODYyMzIxNjgsInN1YiI6ImRpZDprZXk6ejZNa2hhWGdCWkR2b3REa0w1MjU3ZmFpenRpR2lDMlF0S0xHcGJubkVHdGEyZG9LIiwidmMiOnsiQGNvbnRleHQiOlsiaHR0cHM6Ly93d3cudzMub3JnLzIwMTgvY3JlZGVudGlhbHMvdjEiLCJodHRwczovL3NjaGVtYS5vcmciLCJodHRwczovL3ZlcmFtby5pby9jb250ZXh0cy9wcm9maWxlL3YxIl0sImNyZWRlbnRpYWxTdWJqZWN0Ijp7ImdlbmRlciI6Im1hbGUiLCJuYW1lIjoiQm9iIn0sInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRpYWwiLCJQZXJzb24iXX19.wMfdR6RtyAZA4eoWya5Aw97wwER2Cm5Guk780Xw8H9fA3sfudIJeLRLboqixpTchqSbYeA7KbuCTAnLgXTD_Cg
 *           type: JwtProof2020
 *         type:
 *           - VerifiableCredential
 *           - Person
 *     CredentialRevokeRequest:
 *       type: object
 *       properties:
 *         credential:
 *           description: Verifiable Credential to be revoked as a VC-JWT string or a JSON object.
 *           oneOf:
 *             - type: object
 *             - type: string
 *     RevocationResult:
 *       properties:
 *         revoked:
 *           type: boolean
 *           example: true
 *     SuspensionResult:
 *       properties:
 *         suspended:
 *           type: boolean
 *           example: true
 *     UnsuspensionResult:
 *       properties:
 *         unsuspended:
 *           type: boolean
 *           example: true
 *     CredentialVerifyRequest:
 *       type: object
 *       properties:
 *         credential:
 *           description: Verifiable Credential to be verified as a VC-JWT string or a JSON object.
 *           allOf:
 *             - type: object
 *             - type: string
 *         policies:
 *           description: Custom verification policies to execute when verifying credential.
 *           type: object
 *           properties:
 *             now:
 *               description: Policy to verify current time during the verification check (provided as Unix/epoch time).
 *               type: number
 *             issuanceDate:
 *               description: Policy to skip the `issuanceDate` (`nbf`) timestamp check when set to `false`.
 *               type: boolean
 *             expirationDate:
 *               description: Policy to skip the `expirationDate` (`exp`) timestamp check when set to `false`.
 *               type: boolean
 *             audience:
 *               description: Policy to skip the audience check when set to `false`.
 *               type: boolean
 *     IVerifyResult:
 *       type: object
 *       properties:
 *         verified:
 *           type: boolean
 *         issuer:
 *           type: string
 *         signer:
 *           type: object
 *         jwt:
 *           type: string
 *         verifiableCredential:
 *           type: object
 *       example:
 *         verified: true
 *         polices: {}
 *         issuer: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *         signer:
 *           controller: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *           id: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0#key-1
 *           publicKeyBase58: BTJiso1S4iSiReP6wGksSneGfiKHxz9SYcm2KknpqBJt
 *           type: Ed25519VerificationKey2018
 *     PresentationRequest:
 *       type: object
 *       required:
 *         - presentation
 *       properties:
 *         presentation:
 *           description: Verifiable Presentation to be verified as a VP-JWT string or a JSON object.
 *           allOf:
 *             - type: string
 *             - type: object
 *         verifiedDid:
 *           description: Provide an optional verifier DID (also known as 'domain' parameter), if the verifier DID in the presentation is not managed in the wallet.
 *           type: string
 *         policies:
 *           description: Custom verification policies to execute when verifying presentation.
 *           type: object
 *           properties:
 *             now:
 *               description: Policy to verify current time during the verification check (provided as Unix/epoch time).
 *               type: number
 *             issuanceDate:
 *               description: Policy to skip the `issuanceDate` (`nbf`) timestamp check when set to `false`.
 *               type: boolean
 *             expirationDate:
 *               description: Policy to skip the `expirationDate` (`exp`) timestamp check when set to `false`.
 *               type: boolean
 *             audience:
 *               description: Policy to skip the audience check when set to `false`.
 *               type: boolean
 *     CredentialStatusCreateBody:
 *       allOf:
 *         - type: object
 *           required:
 *             - did
 *             - statusListName
 *           properties:
 *             did:
 *               description: DID of the StatusList2021 publisher.
 *               type: string
 *               format: uri
 *             statusListName:
 *               description: The name of the StatusList2021 DID-Linked Resource to be created.
 *               type: string
 *             length:
 *               description: The length of the status list to be created. The default and minimum length is 140000 which is 16kb.
 *               type: integer
 *               minimum: 0
 *               exclusiveMinimum: true
 *               default: 140000
 *             encoding:
 *               description: The encoding format of the StatusList2021 DiD-Linked Resource to be created.
 *               type: string
 *               default: base64url
 *               enum:
 *                 - base64url
 *                 - base64
 *                 - hex
 *             statusListVersion:
 *               description: Optional field to assign a human-readable version in the StatusList2021 DID-Linked Resource.
 *               type: string
 *         - $ref: '#/components/schemas/AlsoKnownAs'
 *     CredentialStatusCreateUnencryptedRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/CredentialStatusCreateBody'
 *       example:
 *         did: did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e
 *         statusListName: cheqd-employee-credentials
 *         length: 140000
 *         encoding: base64url
 *     CredentialStatusUnencryptedResult:
 *       type: object
 *       properties:
 *         resource:
 *           type: object
 *           properties:
 *             StatusList2021:
 *               type: object
 *               properties:
 *                 encodedList:
 *                   type: string
 *                   example: H4sIAAAAAAAAA-3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAADwaDhDr_xcRAAA
 *                 type:
 *                   type: string
 *                   example: StatusList2021Revocation
 *                 validFrom:
 *                   type: string
 *                   format: date-time
 *                   example: 2023-06-26T11:45:19.349Z
 *             metadata:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   example: StatusList2021Revocation
 *                 encoding:
 *                   type: string
 *                   example: base64url
 *                 encrypted:
 *                   type: boolean
 *                   example: false
 *         resourceMetadata:
 *           type: object
 *           example:
 *             resourceURI: did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e/resources/5945233a-a4b5-422b-b893-eaed5cedd2dc
 *             resourceCollectionId: 7c2b990c-3d05-4ebf-91af-f4f4d0091d2e
 *             resourceId: 5945233a-a4b5-422b-b893-eaed5cedd2dc
 *             resourceName: cheqd-employee-credentials
 *             resourceType: StatusList2021Revocation
 *             mediaType: application/json
 *             resourceVersion: 1.0.0
 *             created: 2023-06-26T11:45:20Z
 *             checksum: 909e22e371a41afbb96c330a97752cf7c8856088f1f937f87decbef06cbe9ca2
 *             previousVersionId: null
 *             nextVersionId: null
 *     CredentialStatusCreateUnencryptedResult:
 *       allOf:
 *         - type: object
 *           properties:
 *             created:
 *               type: boolean
 *               example: true
 *         - $ref: '#/components/schemas/CredentialStatusUnencryptedResult'
 *     CredentialStatusEncryptedPaymentConditionsBody:
 *       type: object
 *       properties:
 *         feePaymentAddress:
 *           description: The cheqd/Cosmos payment address where payments to unlock the encrypted StatusList2021 DID-Linked Resource need to be sent.
 *           type: string
 *           example: cheqd1qs0nhyk868c246defezhz5eymlt0dmajna2csg
 *         feePaymentAmount:
 *           description: Amount in CHEQ tokens to unlocked the encrypted StatusList2021 DID-Linked Resource.
 *           type: number
 *           minimum: 0
 *           exclusiveMinimum: true
 *           default: 20
 *         feePaymentWindow:
 *           description: Time window (in minutes) within which the payment to unlock the encrypted StatusList2021 DID-Linked Resource is considered valid.
 *           type: number
 *           minimum: 0
 *           exclusiveMinimum: true
 *           default: 10
 *     CredentialStatusEncryptedPaymentConditionsJson:
 *       type: object
 *       properties:
 *         paymentConditions:
 *           allOf:
 *            - $ref: '#/components/schemas/CredentialStatusEncryptedPaymentConditionsBody'
 *     CredentialStatusCreateEncryptedFormRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/CredentialStatusCreateBody'
 *         - $ref: '#/components/schemas/CredentialStatusEncryptedPaymentConditionsBody'
 *         - type: object
 *           required:
 *             - feePaymentAddress
 *             - feePaymentAmount
 *             - feePaymentWindow
 *     CredentialStatusCreateEncryptedJsonRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/CredentialStatusCreateBody'
 *         - $ref: '#/components/schemas/CredentialStatusEncryptedPaymentConditionsJson'
 *         - type: object
 *           required:
 *             - paymentConditions
 *       example:
 *         did: did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e
 *         statusListName: cheqd-employee-credentials-encrypted
 *         paymentConditions:
 *           - feePaymentAddress: cheqd1qs0nhyk868c246defezhz5eymlt0dmajna2csg
 *             feePaymentAmount: 20
 *             feePaymentWindow: 10
 *     CredentialStatusEncryptedResult:
 *       type: object
 *       properties:
 *         resource:
 *           type: object
 *           properties:
 *             StatusList2021:
 *               type: object
 *               properties:
 *                 encodedList:
 *                   type: string
 *                   example: 496fdfbeb745b4db03fcdb40566f9c4c4a1c0f184b31255e641b6e7bdfb9b6946c12be87ca3763be0393c00b67ac1e8737c106b32f46ef59c765754415b5e8cc7c65fccaa3374620430ea476301a5e0dd63340e7a27a68bc627518471f22e4a2
 *                 type:
 *                   type: string
 *                   example: StatusList2021Revocation
 *                 validFrom:
 *                   type: string
 *                   format: date-time
 *                   example: 2023-06-26T11:45:19.349Z
 *             metadata:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   example: StatusList2021Revocation
 *                 encoding:
 *                   type: string
 *                   example: base64url
 *                 encrypted:
 *                   type: boolean
 *                   example: true
 *                 encryptedSymmetricKey:
 *                   type: string
 *                   example: b11182dc524b8181f9a6aef4c4ad0a1c14e40033b9112dffd8d1bcf6cc3b85abc07ded2205ee94068a99f4202502cb0855f322583fa6ce1534d3a05bf36891766ea2c5f90a982b3040680762977d404d758a2370224a239c8279aa7d21e980931c42055b17ca4c7dbffa4782480a8b6279cf989b2f166d5fdb4b2c1b5a63927200000000000000203018dcaba26df45a415bb599218b27ca853a70289d7a3ed3ed0e3730452e8f8d9af91b6e71312565d2c069341f6660ab
 *                 paymentConditions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       feePaymentAddress:
 *                         type: string
 *                         example: cheqd1qs0nhyk868c246defezhz5eymlt0dmajna2csg
 *                       feePaymentAmount:
 *                         type: string
 *                         example: 20000000000ncheq
 *                       intervalInSeconds:
 *                         type: number
 *                         example: 600
 *                       type:
 *                         type: string
 *                         example: timelockPayment
 *             resourceMetadata:
 *               type: object
 *               example:
 *                 resourceURI: did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e/resources/5945233a-a4b5-422b-b893-eaed5cedd2dc
 *                 resourceCollectionId: 7c2b990c-3d05-4ebf-91af-f4f4d0091d2e
 *                 resourceId: 5945233a-a4b5-422b-b893-eaed5cedd2dc
 *                 resourceName: cheqd-revocation-encrypted-1
 *                 resourceType: StatusList2021Revocation
 *                 mediaType: application/json
 *                 resourceVersion: 2023-06-26T11:45:19.349Z
 *                 created: 2023-06-26T11:45:20Z
 *                 checksum: 909e22e371a41afbb96c330a97752cf7c8856088f1f937f87decbef06cbe9ca2
 *                 previousVersionId: null
 *                 nextVersionId: null
 *             symmetricKey:
 *               type: string
 *               example: dfe204ee95ae74ea5d74b94c3d8ff782273905b07fbc9f8c3d961c3b43849f18
 *     CredentialStatusCreateEncryptedResult:
 *       allOf:
 *         - type: object
 *           properties:
 *             created:
 *               type: boolean
 *               example: true
 *         - $ref: '#/components/schemas/CredentialStatusEncryptedResult'
 *     CredentialStatusUpdateBody:
 *       type: object
 *       required:
 *         - did
 *         - statusListName
 *         - indices
 *       properties:
 *         did:
 *           description: DID of the StatusList2021 publisher.
 *           type: string
 *           format: uri
 *         statusListName:
 *           description: The name of the StatusList2021 DID-Linked Resource to be updated.
 *           type: string
 *         indices:
 *           description: List of credential status indices to be updated. The indices must be in the range of the status list.
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 0
 *             exclusiveMinimum: false
 *         statusListVersion:
 *           description: Optional field to assign a human-readable version in the StatusList2021 DID-Linked Resource.
 *           type: string
 *     CredentialStatusUpdateUnencryptedRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/CredentialStatusUpdateBody'
 *       example:
 *         did: did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e
 *         statusListName: cheqd-employee-credentials
 *         indices:
 *           - 10
 *           - 3199
 *           - 12109
 *           - 130999
 *     CredentialStatusUpdateUnencryptedResult:
 *       allOf:
 *         - type: object
 *           properties:
 *             updated:
 *               type: boolean
 *               example: true
 *         - oneOf:
 *           - $ref: '#/components/schemas/RevocationResult'
 *           - $ref: '#/components/schemas/SuspensionResult'
 *           - $ref: '#/components/schemas/UnsuspensionResult'
 *         - $ref: '#/components/schemas/CredentialStatusUnencryptedResult'
 *     CredentialStatusUpdateEncryptedFormRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/CredentialStatusUpdateBody'
 *         - type: object
 *           required:
 *             - symmetricKey
 *           properties:
 *             symmetricKey:
 *               description: The symmetric key used to encrypt the StatusList2021 DID-Linked Resource.
 *               type: string
 *         - $ref: '#/components/schemas/CredentialStatusEncryptedPaymentConditionsBody'
 *     CredentialStatusUpdateEncryptedJsonRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/CredentialStatusUpdateBody'
 *         - type: object
 *           required:
 *             - symmetricKey
 *           properties:
 *             symmetricKey:
 *               description: The symmetric key used to encrypt the StatusList2021 DID-Linked Resource.
 *               type: string
 *         - $ref: '#/components/schemas/CredentialStatusEncryptedPaymentConditionsJson'
 *       example:
 *         did: did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e
 *         statusListName: cheqd-employee-credentials-encrypted
 *         indices:
 *           - 10
 *           - 3199
 *           - 12109
 *           - 130999
 *         symmetricKey: dfe204ee95ae74ea5d74b94c3d8ff782273905b07fbc9f8c3d961c3b43849f18
 *     CredentialStatusUpdateEncryptedResult:
 *       allOf:
 *         - type: object
 *           properties:
 *             updated:
 *               type: boolean
 *               example: true
 *         - oneOf:
 *           - $ref: '#/components/schemas/RevocationResult'
 *           - $ref: '#/components/schemas/SuspensionResult'
 *           - $ref: '#/components/schemas/UnsuspensionResult'
 *         - $ref: '#/components/schemas/CredentialStatusEncryptedResult'
 *     CredentialStatusCheckRequest:
 *       type: object
 *       required:
 *         - did
 *         - statusListName
 *         - index
 *       properties:
 *         did:
 *           description: DID of the StatusList2021 publisher.
 *           type: string
 *           format: uri
 *         statusListName:
 *           description: The name of the StatusList2021 DID-Linked Resource to be checked.
 *           type: string
 *         index:
 *           description: Credential status index to be checked for revocation or suspension.
 *           type: integer
 *           minimum: 0
 *           exclusiveMinimum: false
 *         makeFeePayment:
 *           description: Automatically make fee payment (if required) based on payment conditions to unlock encrypted StatusList2021 DID-Linked Resource.
 *           type: boolean
 *           default: true
 *     CredentialStatusCheckResult:
 *       oneOf:
 *       - $ref: '#/components/schemas/CredentialStatusCheckRevocationResult'
 *       - $ref: '#/components/schemas/CredentialStatusCheckSuspensionResult'
 *     CredentialStatusCheckRevocationResult:
 *       type: object
 *       properties:
 *         checked:
 *           type: boolean
 *           example: true
 *         revoked:
 *           type: boolean
 *           example: false
 *     CredentialStatusCheckSuspensionResult:
 *       type: object
 *       properties:
 *         checked:
 *           type: boolean
 *           example: true
 *         suspended:
 *           type: boolean
 *           example: false
 *     CredentialStatusListSearchResult:
 *       allOf:
 *         - type: object
 *           properties:
 *             found:
 *               type: boolean
 *               example: true
 *         - oneOf:
 *           - $ref: '#/components/schemas/CredentialStatusUnencryptedResult'
 *           - $ref: '#/components/schemas/CredentialStatusEncryptedResult'
 *     KeyResult:
 *       type: object
 *       properties:
 *         kid:
 *           type: string
 *         type:
 *           type: string
 *           enum: [ Ed25519, Secp256k1 ]
 *         publicKeyHex:
 *           type: string
 *     DidDocument:
 *       description: This input field contains either a complete DID document, or an incremental change (diff) to a DID document. See <a href="https://identity.foundation/did-registration/#diddocument">Universal DID Registrar specification</a>.
 *       type: object
 *       properties:
 *         '@context':
 *           type: array
 *           items:
 *             type: string
 *         id:
 *          type: string
 *         controllers:
 *           type: array
 *           items:
 *             type: string
 *         verificationMethod:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/VerificationMethod'
 *         service:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Service'
 *         authentication:
 *           type: array
 *           items:
 *             type: string
 *         assertionMethod:
 *           type: array
 *           items:
 *             type: string
 *         capabilityInvocation:
 *           type: array
 *           items:
 *             type: string
 *         capabilityDelegation:
 *           type: array
 *           items:
 *             type: string
 *         keyAgreement:
 *           type: array
 *           items:
 *             type: string
 *       example:
 *         '@context':
 *           - https://www.w3.org/ns/did/v1
 *         id: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *         controller:
 *           - did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *         verificationMethod:
 *           - id: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0#key-1
 *             type: Ed25519VerificationKey2018
 *             controller: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *             publicKeyBase58: z6MkkVbyHJLLjdjU5B62DaJ4mkdMdUkttf9UqySSkA9bVTeZ
 *         authentication:
 *           - did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0#key-1
 *         service:
 *           - id: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0#service-1
 *             type: LinkedDomains
 *             serviceEndpoint:
 *               - https://example.com
 *     DidCreateRequest:
 *       type: object
 *       properties:
 *         network:
 *           description: Network to create the DID on (testnet or mainnet)
 *           type: string
 *           enum:
 *             - testnet
 *             - mainnet
 *         methodSpecificIdAlgo:
 *           description: Algorithm to use for generating the method-specific ID. The two styles supported are UUIDs and Indy-style Base58. See <a href="https://docs.cheqd.io/identity/architecture/adr-list/adr-001-cheqd-did-method#cheqd-did-method-did-cheqd">cheqd DID method documentation</a> for more details.
 *           type: string
 *           enum:
 *             - uuid
 *             - base58btc
 *         verificationMethodType:
 *           description: Type of verification method to use for the DID. See <a href="https://www.w3.org/TR/did-core/#verification-methods">DID Core specification</a> for more details. Only the types listed below are supported.
 *           type: string
 *           enum:
 *             - Ed25519VerificationKey2018
 *             - JsonWebKey2020
 *             - Ed25519VerificationKey2020
 *         assertionMethod:
 *           description: Usually a reference to a Verification Method. An Assertion Method is required to issue JSON-LD credentials. See <a href="https://w3c.github.io/did-core/#assertion">DID Core specification</a> for more details.
 *           type: boolean
 *           default: true
 *         didDocument:
 *           $ref: '#/components/schemas/DidDocument'
 *     DidResult:
 *       type: object
 *       properties:
 *         did:
 *           type: string
 *         controllerKeyId:
 *           type: string
 *         keys:
 *           type: array
 *           items:
 *             type: object
 *         services:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Service'
 *     VerificationMethod:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         type:
 *           type: string
 *         controller:
 *           type: string
 *         publicKeyMultibase:
 *           type: string
 *         publicKeyJwk:
 *           type: array
 *           items:
 *             type: string
 *       example:
 *         controller: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *         id: did:cheqd:testnet :7bf81a20-633c-4cc7-bc4a-5a45801005e0#key-1
 *         publicKeyBase58: BTJiso1S4iSiReP6wGksSneGfiKHxz9SYcm2KknpqBJt
 *         type: Ed25519VerificationKey2018
 *     Service:
 *       type: object
 *       properties:
 *         id:
 *           description: DID appended with Service fragment ID (e.g., `#service-1` in `did:cheqd:mainnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0#service-1`)
 *           type: string
 *           example: did:cheqd:mainnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0#service-1
 *         type:
 *           description: Service type as defined in <a href="https://www.w3.org/TR/did-spec-registries/#service-types">DID Specification Registries</a>.
 *           type: string
 *           example: LinkedDomains
 *         serviceEndpoint:
 *           description: Service endpoint as defined in <a href="https://www.w3.org/TR/did-core/#services">DID Core Specification</a>.
 *           type: array
 *           items:
 *             type: string
 *             example: https://example.com
 *     DidUpdateRequest:
 *       type: object
 *       properties:
 *         did:
 *           description: DID identifier to be updated.
 *           type: string
 *           example: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *         service:
 *           type: array
 *           description: Service section of the DID Document.
 *           items:
 *             $ref: '#/components/schemas/Service'
 *         verificationMethod:
 *           type: array
 *           description: Verification Method section of the DID Document.
 *           items:
 *             $ref: '#/components/schemas/VerificationMethod'
 *         authentication:
 *           description: Authentication section of the DID Document.
 *           type: array
 *           items:
 *             type: string
 *         didDocument:
 *           $ref: '#/components/schemas/DidDocument'
 *     CreateResourceRequest:
 *       description: Input fields for DID-Linked Resource creation.
 *       type: object
 *       additionalProperties: false
 *       required:
 *         - name
 *         - type
 *         - data
 *         - encoding
 *       properties:
 *         data:
 *           description: Encoded string containing the data to be stored in the DID-Linked Resource.
 *           type: string
 *         encoding:
 *           description: Encoding format used to encode the data.
 *           type: string
 *           enum:
 *             - base64url
 *             - base64
 *             - hex
 *         name:
 *           description: Name of DID-Linked Resource.
 *           type: string
 *         type:
 *           description: Type of DID-Linked Resource. This is NOT the same as the media type, which is calculated automatically ledger-side.
 *           type: string
 *         alsoKnownAs:
 *           description: Optional field to assign a set of alternative URIs where the DID-Linked Resource can be fetched from.
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               uri:
 *                 type: string
 *               description:
 *                 type: string
 *         version:
 *           description: Optional field to assign a human-readable version in the DID-Linked Resource.
 *           type: string
 *       example:
 *         data: SGVsbG8gV29ybGQ=
 *         encoding: base64url
 *         name: ResourceName
 *         type: TextDocument
 *     ResourceList:
 *       type: object
 *       properties:
 *         '@context':
 *           type: string
 *           example: https://w3id.org/did-resolution/v1
 *         contentMetadata:
 *           type: object
 *         contentStream:
 *           type: object
 *         dereferencingMetadata:
 *           $ref: '#/components/schemas/DereferencingMetadata'
 *     DereferencingMetadata:
 *       type: object
 *       properties:
 *         contentType:
 *           type: string
 *           example: application/did+ld+json
 *         did:
 *           $ref: '#/components/schemas/DidProperties'
 *         retrieved:
 *           type: string
 *           example: "2021-09-01T12:00:00Z"
 *     DidResolution:
 *       type: object
 *       properties:
 *          '@context':
 *            type: string
 *            example: https://w3id.org/did-resolution/v1
 *          didDidResolutionMetadata:
 *            $ref: '#/components/schemas/DidResolutionMetadata'
 *          didDocument:
 *            $ref: '#/components/schemas/DidDocument'
 *          didDocumentMetadata:
 *            $ref: '#/components/schemas/DidDocumentMetadata'
 *     DeactivatedDidResolution:
 *       type: object
 *       properties:
 *          '@context':
 *            type: string
 *            example: https://w3id.org/did-resolution/v1
 *          didDidResolutionMetadata:
 *            $ref: '#/components/schemas/DidResolutionMetadata'
 *          didDocument:
 *            $ref: '#/components/schemas/DidDocument'
 *          didDocumentMetadata:
 *            $ref: '#/components/schemas/DeactivatedDidDocumentMetadata'
 *     DidDocumentMetadata:
 *       type: object
 *       properties:
 *         created:
 *           type: string
 *           example: "2021-09-01T12:00:00Z"
 *         deactivated:
 *           type: boolean
 *           example: false
 *         updated:
 *           type: string
 *           example: "2021-09-10T12:00:00Z"
 *         versionId:
 *           type: string
 *           example: 3ccde6ba-6ba5-56f2-9f4f-8825561a9860
 *         linkedResourceMetadata:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ResourceMetadata'
 *     DeactivatedDidDocumentMetadata:
 *       type: object
 *       properties:
 *         created:
 *           type: string
 *           example: "2021-09-01T12:00:00Z"
 *         deactivated:
 *           type: boolean
 *           example: true
 *         updated:
 *           type: string
 *           example: "2021-09-10T12:00:00Z"
 *         versionId:
 *           type: string
 *           example: 3ccde6ba-6ba5-56f2-9f4f-8825561a9860
 *         linkedResourceMetadata:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ResourceMetadata'
 *     ResourceMetadata:
 *       type: object
 *       properties:
 *         resourceURI:
 *           type: string
 *           example: did:cheqd:testnet:55dbc8bf-fba3-4117-855c-1e0dc1d3bb47/resources/398cee0a-efac-4643-9f4c-74c48c72a14b
 *         resourceCollectionId:
 *           type: string
 *           example: 55dbc8bf-fba3-4117-855c-1e0dc1d3bb47
 *         resourceId:
 *           type: string
 *           example: 398cee0a-efac-4643-9f4c-74c48c72a14b
 *         resourceName:
 *           type: string
 *           example: cheqd-issuer-logo
 *         resourceType:
 *           type: string
 *           example: CredentialArtwork
 *         mediaType:
 *           type: string
 *           example: image/png
 *         resourceVersion:
 *           type: string
 *           example: "1.0"
 *         checksum:
 *           type: string
 *           example: a95380f460e63ad939541a57aecbfd795fcd37c6d78ee86c885340e33a91b559
 *         created:
 *           type: string
 *           example: "2021-09-01T12:00:00Z"
 *         nextVersionId:
 *           type: string
 *           example: d4829ac7-4566-478c-a408-b44767eddadc
 *         previousVersionId:
 *           type: string
 *           example: ad7a8442-3531-46eb-a024-53953ec6e4ff
 *     DidResolutionMetadata:
 *       type: object
 *       properties:
 *         contentType:
 *           allOf:
 *           - $ref: '#/components/schemas/ContentType'
 *           example: application/did+ld+json
 *         retrieved:
 *           type: string
 *           example: '2021-09-01T12:00:00Z'
 *         did:
 *           $ref: '#/components/schemas/DidProperties'
 *     ContentType:
 *       type: string
 *       enum:
 *       - application/did+json
 *       - application/did+ld+json
 *       - application/ld+json
 *       - application/json
 *     DidProperties:
 *       type: object
 *       properties:
 *         didString:
 *           type: string
 *           example: did:cheqd:testnet:55dbc8bf-fba3-4117-855c-1e0dc1d3bb47
 *         method:
 *           type: string
 *           example: cheqd
 *         methodSpecificId:
 *           type: string
 *           example: 55dbc8bf-fba3-4117-855c-1e0dc1d3bb47
 *     Customer:
 *       type: object
 *       properties:
 *         customerId:
 *           type: string
 *           example: 6w5drpiiwhhs
 *         address:
 *           type: string
 *           example: cheqd1wgsvqwlkmdp60f4dek26ak0sjw6au3ytd3pz7f
 *     InvalidRequest:
 *       description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: InvalidRequest
 *     InternalError:
 *       description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: Internal Error
 *     UnauthorizedError:
 *       description: Access token is missing or invalid
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: Unauthorized Error
 */
