/**
 * @openapi
 * 
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     CredentialRequest:
 *       description: Input fields for the create operation.
 *       type: object
 *       additionalProperties: false
 *       properties:
 *         issuerDid:
 *           description: This input field is the Issuer's DID.
 *           type: string
 *         subjectDid:
 *           description: This input field is the holder's DID.
 *           type: string
 *         attributes:
 *           description: Json input of the attributes.
 *           type: object
 *         '@context':
 *           description: Additional contexts to be included in the credential.
 *           type: array
 *           items:
 *             type: string
 *         type:
 *           description: Additional type property to be included in the credential.
 *           type: array
 *           items:
 *             type: string
 *         expirationDate:
 *           description: Optional expiration date according to the <a href=https://www.w3.org/TR/vc-data-model/#expiration> specification</a>.
 *         format:
 *           description: Select one of the supported credential formats, jwt by default.
 *           type: string
 *           enum:
 *             - jwt
 *             - lds
 *         credentialStatus:
 *           description: Optional field to support revocation or suspension, which takes statusListName and statusListPurpose as inputs.
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
 *             statusListRangeStart:
 *               type: number
 *             statusListRangeEnd:
 *               type: number
 *             indexNotIn:
 *               type: number
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
 *       description: Input fields for the update operation.
 *       type: object
 *       additionalProperties: false
 *       properties:
 *         '@context':
 *           type: array
 *           items:
 *             type: string
 *         type:
 *           type: array
 *           items:
 *             type: string
 *         expirationDate:
 *           type: string
 *         issuer:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *         credentialSubject:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *         credentialStatus:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             statusListIndex:
 *               type: string
 *             statusPurpose:
 *               type: string
 *               enum:
 *                 - revocation
 *                 - suspension
 *             type:
 *               type: string
 *               enum:
 *                 - StatusList2021Entry
 *         issuanceDate:
 *           type: string
 *         proof:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *             jwt:
 *               type: string
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
 *           description: This input field takes the credential object or the JWT string
 *           oneOf:
 *             - type: object
 *             - type: string
 *     RevocationResult:
 *       properties:
 *         revoked:
 *           type: boolean
 *     SuspensionResult:
 *       properties:
 *         suspended:
 *           type: boolean
 *         statusList:
 *           type: string
 *     UnSuspensionResult:
 *       properties:
 *         unsuspended:
 *           type: boolean
 *         statusList:
 *           type: string
 *     CredentialVerifyRequest:
 *       type: object
 *       properties:
 *         credential:
 *           description: This input field takes the credential object or the JWT string.\
 *           allOf:
 *             - type: object
 *             - type: string
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
 *           description: This input field takes the presentation object or the JWT string.
 *           allOf:
 *             - type: string
 *             - type: object
 *     CredentialStatusCreateRequest:
 *       allOf:
 *         - type: object
 *           required:
 *             - did
 *             - statusListName
 *           properties:
 *             did:
 *               description: The DID of the status list publisher.
 *               type: string
 *             statusListName:
 *               description: The name of the status list to be created.
 *               type: string
 *             length:
 *               description: The length of the status list to be created. The default and minimum length is 140000 which is 16kb.
 *             encoding:
 *               description: The encoding format of the statusList to be published.
 *               type: string
 *               default: base64url
 *               enum:
 *                 - base64url
 *                 - base64
 *                 - hex
 *             statusListVersion:
 *               description: This input field is OPTIONAL, If present assigns the version to be assigned to the statusList.
 *               type: string
 *             alsoKnownAs:
 *               description: The input field is OPTIONAL. If present, the value MUST be a set where each item in the set is a uri.
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   uri:
 *                     type: string
 *                   description:
 *                     type: string
 *       example:
 *         did: did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e
 *         statusListName: cheqd-employee-credentials
 *     CredentialStatusResult:
 *       type: object
 *       properties:
 *         success:
 *           type: object
 *           properties: 
 *             created:
 *               type: boolean
 *             resource:
 *               type: object
 *               metadata:
 *                 encoding: base64url
 *                 encrypted: false
 *             resourceMetadata:
 *               type: object
 *             statusList2021:
 *               type: object
 *               properties:
 *                 statusList2021:
 *                   type: object
 *                   properties:
 *                     encodedList:
 *                       type: string
 *                     type:
 *                       type: string
 *                     validFrom:
 *                       type: string
 *             metadata:
 *               type: string
 *               properties:
 *                 encoding:
 *                   type: string
 *                 encrypted:
 *                   type: boolean
 *       example:
 *         created: true
 *         resource: 
 *           StatusList2021: 
 *             encodedList: H4sIAAAAAAAAA-3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAADwaDhDr_xcRAAA
 *             type: StatusList2021Revocation
 *             validFrom: 2023-06-26T11:45:19.349Z
 *           metadata:
 *             encoding: base64url
 *             encrypted: false
 *         resourceMetadata:
 *           checksum: 909e22e371a41afbb96c330a97752cf7c8856088f1f937f87decbef06cbe9ca2
 *           created: 2023-06-26T11:45:20Z
 *           mediaType: application/json
 *           nextVersionId: null
 *           previousVersionId: null
 *           resourceCollectionId: 7c2b990c-3d05-4ebf-91af-f4f4d0091d2e
 *           resourceId: 5945233a-a4b5-422b-b893-eaed5cedd2dc
 *           resourceName: cheqd-revocation-1
 *           resourceType: StatusList2021Revocation
 *           resourceURI: did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e/resources/5945233a-a4b5-422b-b893-eaed5cedd2dc
 *           resourceVersion: 2023-06-26T11:45:19.349Z
 *     CredentialStatusPublishRequest:
 *       allOf:
 *         - type: object
 *           required:
 *             - did
 *             - encodedList
 *             - statusListName
 *             - encoding
 *           properties:
 *             did:
 *               description: The DID of the status list publisher.
 *               type: string
 *             statusListName:
 *               description: The name of the statusList to be published
 *               type: string
 *             encodedList:
 *               description: The encoding format of the statusList provided
 *               type: string
 *               enum:
 *                 - base64url
 *                 - base64
 *                 - hex
 *             statusListVersion:
 *               description: This input field is OPTIONAL, If present assigns the version to be assigned to the statusList
 *               type: string
 *             alsoKnownAs:
 *                description: The input field is OPTIONAL. If present, the value MUST be a set where each item in the set is a uri.
 *                type: array
 *                items:
 *                  type: object
 *                  properties:
 *                    uri:
 *                      type: string
 *                    description:
 *                      type: string
 *       example:
 *         did: did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e
 *         name: cheqd-employee-credentials
 *         version: '2023'
 *         data: H4sIAAAAAAAAA-3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAADwaDhDr_xcRAAA
 *         encoding: base64url
 *     CredentialStatusUpdateRequest:
 *       type: object
 *       required:
 *         - did
 *         - statusListName
 *         - indices
 *       properties:
 *         did:
 *           description: The DID of the status list publisher.
 *           type: string
 *         statusListName:
 *           description: The name of the status list to be created.
 *           type: string
 *         indices:
 *           description: Provide the list of indices to be updated.
 *           type: array
 *           items:
 *             type: number
 *         statusListVersion:
 *           description: The input field is OPTIONAL, If present uses the provided statusListVersion for the update operation.
 *           type: string
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
 *       description: This input field contains either a complete DID document, or an incremental change (diff) to a DID document. See <a href=\"https://identity.foundation/did-registration/#diddocument\">https://identity.foundation/did-registration/#diddocument</a>.
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
 *         verificationMethod:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/VerificationMethod'
 *         service:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Service'
 *       example: 
 *         id: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *         controller:
 *           - did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *         verificationMethod:
 *           - id: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0#key-1
 *             type: Ed25519VerificationKey2018
 *             controller: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
 *             publicKeyBase58: BTJiso1S4iSiReP6wGksSneGfiKHxz9SYcm2KknpqBJt
 *         authentication:
 *           - did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0#key-1
 *     DidCreateRequest:
 *       type: object
 *       properties:
 *         network:
 *           type: string
 *           enum:
 *             - testnet
 *             - mainnet
 *         methodSpecificIdAlgo:
 *           type: string
 *           enum:
 *             - uuid
 *             - base58btc
 *         verificationMethodType:
 *           type: string
 *           enum:
 *             - Ed25519VerificationKey2018
 *             - JsonWebKey2020
 *             - Ed25519VerificationKey2020
 *         serviceEndpoint:
 *           type: string
 *         assertionMethod:
 *           description: An assertion method is required to issue JSONLD credentials.
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
 *           type: string
 *           example: did:cheqd:testnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0#rand
 *         type:
 *           type: string
 *           example: rand
 *         serviceEndpoint:
 *           type: array
 *           items:
 *             type: string
 *             example: https://rand.in
 *     DidUpdateRequest:
 *       type: object
 *       properties:
 *         did:
 *           type: string
 *         service:
 *           type: array
 *           description: This input field assigns the provided service array to the DID Document.
 *           items:
 *             $ref: '#/components/schemas/Service'
 *         verificationMethod:
 *           type: array
 *           description: This input field assigns the provided verificationMethod array to the DID Document.
 *           items:
 *             $ref: '#/components/schemas/VerificationMethod'
 *         authentication:
 *           description: This input field assigns the provided authentication array to the DID Document.
 *           type: array
 *           items:
 *             type: string
 *         didDocument:
 *           $ref: '#/components/schemas/DidDocument'
 *     CreateResourceRequest:
 *       description: Input fields for the resource creation
 *       type: object
 *       additionalProperties: false
 *       required:
 *         - name
 *         - type
 *         - data
 *         - encoding
 *       properties:
 *         data:
 *           description: Provide encoded string for the resource data.
 *           type: string
 *         encoding:
 *           description: The encoding format of the resource data.
 *           type: string
 *           enum:
 *             - base64url
 *             - base64
 *             - hex
 *         name:
 *           description: Resource name.
 *           type: string
 *         alsoKnownAs:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               uri:
 *                 type: string
 *               description:
 *                 type: string
 *         version:
 *           type: string
 *       example:
 *         data: SGVsbG8gV29ybGQ=
 *         name: ResourceName
 *         type: TextDocument
 *     Customer:
 *       type: object
 *       properties:
 *         customerId:
 *           type: string
 *         address:
 *           type: string
 *     InvalidRequest:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *     UnauthorizedError:
 *       description: Access token is missing or invalid
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: Unauthorized Error
 */
