import {
	createAgent,
	CredentialPayload,
	DIDDocument,
	IAgentPlugin,
	ICreateVerifiableCredentialArgs,
	ICreateVerifiablePresentationArgs,
	IDIDManager,
	IIdentifier,
	IKey,
	IKeyManager,
	IResolver,
	IVerifyResult,
	MinimalImportableIdentifier,
	PresentationPayload,
	TAgent,
	VerifiableCredential,
	VerifiablePresentation,
	W3CVerifiableCredential,
} from '@veramo/core';
import { KeyManager } from '@veramo/key-manager';
import { DIDStore, KeyStore } from '@veramo/data-store';
import { DIDManager } from '@veramo/did-manager';
import { DIDResolverPlugin, getUniversalResolver as UniversalResolver } from '@veramo/did-resolver';
import { CredentialPlugin } from '@veramo/credential-w3c';
import {
	CredentialIssuerLD,
	LdDefaultContexts,
	VeramoEd25519Signature2018,
	VeramoEd25519Signature2020,
	VeramoJsonWebSignature2020,
} from '@veramo/credential-ld';
import {
	Cheqd,
	getResolver as CheqdDidResolver,
	DefaultResolverUrl,
	type ResourcePayload,
	type ICheqdBroadcastStatusListArgs,
	type ICheqdCheckCredentialStatusWithStatusListArgs,
	type ICheqdCreateStatusList2021Args,
	type ICheqdDeactivateIdentifierArgs,
	type ICheqdRevokeBulkCredentialsWithStatusListArgs,
	type ICheqdUpdateIdentifierArgs,
	type ICheqdVerifyCredentialWithStatusListArgs,
	type ICheqdVerifyPresentationWithStatusListArgs,
	type PaymentCondition,
	BitstringStatusListResourceType,
	DefaultStatusList2021StatusPurposeTypes,
	DefaultStatusListEncodings,
	ICheqdSuspendBulkCredentialsWithStatusListArgs,
	ICheqdUnsuspendBulkCredentialsWithStatusListArgs,
	StatusList2021Revocation,
	StatusList2021Suspension,
	DefaultStatusList2021StatusPurposeType,
	TransactionResult,
	BitstringStatusPurposeTypes,
	DefaultStatusList2021ResourceTypes,
} from '@cheqd/did-provider-cheqd';
import { ResourceModule, type CheqdNetwork } from '@cheqd/sdk';
import { getDidKeyResolver as KeyDidResolver } from '@veramo/did-provider-key';
import { DIDResolutionResult, Resolver, ResolverRegistry } from 'did-resolver';
import { DefaultDidUrlPattern, CreateAgentRequest, VeramoAgent } from '../../types/shared.js';
import type { VerificationOptions } from '../../types/shared.js';
import type {
	CreateEncryptedBitstringOptions,
	CreateUnencryptedBitstringOptions,
	FeePaymentOptions,
} from '../../types/credential-status.js';
import type { CredentialRequest } from '../../types/credential.js';
import { DefaultStatusActions } from '../../types/credential-status.js';
import type { CheckStatusListOptions } from '../../types/credential-status.js';
import type { RevocationStatusOptions, StatusOptions, SuspensionStatusOptions } from '../../types/credential-status.js';
import type {
	BroadcastStatusListOptions,
	CreateUnencryptedStatusListOptions,
	UpdateUnencryptedStatusListOptions,
	CreateEncryptedStatusListOptions,
	UpdateEncryptedStatusListOptions,
	SearchStatusListResult,
} from '../../types/credential-status.js';
import {
	BitstringStatusListEntry,
	MINIMAL_DENOM,
	VC_PROOF_FORMAT,
	VC_REMOVE_ORIGINAL_FIELDS,
} from '../../types/constants.js';
import { toCoin, toDefaultDkg, toMinimalDenom } from '../../helpers/helpers.js';
import { jwtDecode } from 'jwt-decode';
import type {
	ICheqdCreateBitstringStatusListArgs,
	ICheqdCreateLinkedResourceArgs,
	ICheqdVerifyCredentialWithBitstringArgs,
} from '@cheqd/did-provider-cheqd';
import type { TPublicKeyEd25519 } from '@cheqd/did-provider-cheqd';
import { SupportedKeyTypes } from '@veramo/utils';

// dynamic import to avoid circular dependency
const VeridaResolver =
	process.env.ENABLE_VERIDA_CONNECTOR === 'true' ? (await import('@verida/vda-did-resolver')).getResolver : undefined;

export class Veramo {
	static instance = new Veramo();

	public createVeramoAgent({
		providers,
		kms,
		dbConnection,
		cheqdProviders,
		enableResolver,
		enableCredential,
	}: CreateAgentRequest): VeramoAgent {
		const plugins: IAgentPlugin[] = [];

		if (providers) {
			plugins.push(
				new DIDManager({
					store: new DIDStore(dbConnection),
					defaultProvider: 'did:cheqd:testnet',
					providers,
				})
			);
		}

		if (kms) {
			plugins.push(
				new KeyManager({
					store: new KeyStore(dbConnection),
					kms,
				})
			);
		}

		if (cheqdProviders) {
			plugins.push(
				new Cheqd({
					providers: cheqdProviders,
				})
			);
		}

		if (enableResolver) {
			// construct resolver map
			const resolvers = {
				...(CheqdDidResolver({ url: process.env.RESOLVER_URL }) as ResolverRegistry),
				...KeyDidResolver(),
				...UniversalResolver(),
			};

			// handle optional dependencies
			if (VeridaResolver) {
				const veridaResolver = VeridaResolver();

				// add verida resolver to resolver map
				Object.assign(resolvers, veridaResolver);
			}

			plugins.push(
				new DIDResolverPlugin({
					resolver: new Resolver(resolvers),
				})
			);
		}

		if (enableCredential) {
			plugins.push(
				new CredentialPlugin(),
				new CredentialIssuerLD({
					contextMaps: [LdDefaultContexts],
					suites: [
						new VeramoJsonWebSignature2020(),
						new VeramoEd25519Signature2018(),
						new VeramoEd25519Signature2020(),
					],
				})
			);
		}
		return createAgent({ plugins });
	}

	async createKey(agent: TAgent<IKeyManager>, type: SupportedKeyTypes = SupportedKeyTypes.Ed25519) {
		const [kms] = await agent.keyManagerGetKeyManagementSystems();
		return await agent.keyManagerCreate({
			type: type || 'Ed25519',
			kms,
		});
	}

	async importKey(
		agent: TAgent<IKeyManager>,
		type: SupportedKeyTypes = SupportedKeyTypes.Ed25519,
		privateKeyHex: string
	) {
		const [kms] = await agent.keyManagerGetKeyManagementSystems();
		return await agent.keyManagerImport({
			type: type || 'Ed25519',
			kms,
			privateKeyHex,
		});
	}

	async getKey(agent: TAgent<IKeyManager>, kid: string) {
		return await agent.keyManagerGet({ kid });
	}

	async createDid(agent: TAgent<IDIDManager>, network: string, didDocument: DIDDocument): Promise<IIdentifier> {
		try {
			const [kms] = await agent.keyManagerGetKeyManagementSystems();

			const identifier: IIdentifier = await agent.didManagerCreate({
				provider: `did:cheqd:${network}`,
				kms,
				options: {
					document: didDocument,
				},
			});
			return identifier;
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async updateDid(
		agent: VeramoAgent,
		didDocument: DIDDocument,
		publicKeyHexs?: TPublicKeyEd25519[]
	): Promise<IIdentifier> {
		const [kms] = await agent.keyManagerGetKeyManagementSystems();

		const result = await agent.cheqdUpdateIdentifier({
			kms,
			document: didDocument,
			keys: publicKeyHexs,
		} satisfies ICheqdUpdateIdentifierArgs);
		return { ...result, provider: 'cheqd' };
	}

	async deactivateDid(agent: VeramoAgent, did: string, publicKeyHexs?: TPublicKeyEd25519[]): Promise<boolean> {
		try {
			const [kms] = await agent.keyManagerGetKeyManagementSystems();
			const didResolutionResult = await this.resolveDid(agent, did);
			const didDocument = didResolutionResult.didDocument;
			const didMetadata = didResolutionResult.didDocumentMetadata;

			if (!didDocument) {
				throw new Error('DID document not found');
			}

			// check if DID is already deactivated. If yes - just return true
			if (didMetadata.deactivated) {
				return true;
			}

			const result = await agent.cheqdDeactivateIdentifier({
				kms,
				document: didDocument,
				keys: publicKeyHexs,
			} satisfies ICheqdDeactivateIdentifierArgs);
			return result;
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async listDids(agent: TAgent<IDIDManager>) {
		return (await agent.didManagerFind()).map((res) => res.did);
	}

	async resolveDid(agent: TAgent<IResolver>, did: string) {
		return await agent.resolveDid({ didUrl: did });
	}

	async resolve(didUrl: string): Promise<Response> {
		return fetch(`${process.env.RESOLVER_URL || DefaultResolverUrl}/${didUrl}`, {
			headers: { 'Content-Type': '*/*' },
		});
	}

	async getDid(agent: TAgent<IDIDManager>, did: string) {
		return await agent.didManagerGet({ did });
	}

	async importDid(
		agent: TAgent<IDIDManager>,
		did: string,
		keys: Pick<IKey, 'privateKeyHex' | 'type'>[],
		controllerKeyId: string | undefined
	): Promise<IIdentifier> {
		const [kms] = await agent.keyManagerGetKeyManagementSystems();

		if (!did.match(DefaultDidUrlPattern)) {
			throw new Error('Invalid DID');
		}

		const identifier: IIdentifier = await agent.didManagerImport({
			keys: keys.map((key) => {
				return {
					...key,
					kms,
				};
			}),
			did,
			controllerKeyId,
		} as MinimalImportableIdentifier);

		return identifier;
	}

	async createResource(
		agent: VeramoAgent,
		network: string,
		payload: ResourcePayload,
		publicKeyHexs?: TPublicKeyEd25519[]
	) {
		try {
			const [kms] = await agent.keyManagerGetKeyManagementSystems();

			const result: boolean = await agent.cheqdCreateLinkedResource({
				kms,
				payload,
				network: network as CheqdNetwork,
				signInputs: publicKeyHexs,
				fee: {
					amount: [ResourceModule.fees.DefaultCreateResourceJsonFee],
					gas: '2000000',
				},
			} satisfies ICheqdCreateLinkedResourceArgs);
			return result;
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async issueCredential(
		agent: VeramoAgent,
		credential: CredentialPayload,
		format: CredentialRequest['format'],
		statusListOptions: StatusOptions | null
	): Promise<VerifiableCredential> {
		const issuanceOptions: ICreateVerifiableCredentialArgs = {
			save: false,
			credential,
			proofFormat: format == 'jsonld' ? 'lds' : VC_PROOF_FORMAT,
			removeOriginalFields: VC_REMOVE_ORIGINAL_FIELDS,
		};
		try {
			let verifiable_credential: VerifiableCredential;
			if (statusListOptions) {
				const { statusListType, ...statusOptions } = statusListOptions;
				if (statusListType == 'BitstringStatusList') {
					verifiable_credential = await agent.cheqdIssueCredentialWithStatusList({
						issuanceOptions,
						statusOptions: statusOptions,
					});
				} else {
					verifiable_credential =
						statusListOptions.statusPurpose == 'revocation'
							? await agent.cheqdIssueRevocableCredentialWithStatusList2021({
									issuanceOptions,
									statusOptions: statusOptions as RevocationStatusOptions,
								})
							: await agent.cheqdIssueSuspendableCredentialWithStatusList2021({
									issuanceOptions,
									statusOptions: statusOptions as SuspensionStatusOptions,
								});
				}
			} else {
				verifiable_credential = await agent.createVerifiableCredential(issuanceOptions);
			}
			return verifiable_credential;
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async verifyCredential(
		agent: VeramoAgent,
		credential: string | VerifiableCredential,
		verificationOptions: VerificationOptions = {}
	): Promise<IVerifyResult> {
		let result: IVerifyResult;
		if (verificationOptions.verifyStatus) {
			const cred = credential as VerifiableCredential;
			if (cred.credentialStatus?.type === BitstringStatusListEntry) {
				result = await agent.cheqdVerifyCredentialWithStatusList({
					credential: cred,
					fetchList: true,
					verificationArgs: {
						...verificationOptions,
					},
				} as ICheqdVerifyCredentialWithBitstringArgs);
			} else {
				result = await agent.cheqdVerifyCredential({
					credential: cred,
					fetchList: true,
					verificationArgs: {
						...verificationOptions,
					},
				} as ICheqdVerifyCredentialWithStatusListArgs);
			}
		} else {
			result = await agent.verifyCredential({
				credential,
				...verificationOptions,
				policies: {
					...verificationOptions.policies,
					credentialStatus: false,
				},
			});
		}

		if (result.didResolutionResult) {
			delete result.didResolutionResult;
		}

		if (result.jwt) {
			delete result.jwt;
		}

		if (result.verifiableCredential) {
			delete result.verifiableCredential;
		}

		if (result.payload) {
			delete result.payload;
		}

		return result;
	}

	async createPresentation(
		agent: VeramoAgent,
		presentation: PresentationPayload,
		verificationOptions: VerificationOptions = {}
	): Promise<VerifiablePresentation> {
		const presentationOptions: ICreateVerifiablePresentationArgs = {
			save: false,
			presentation,
			proofFormat: VC_PROOF_FORMAT,
			removeOriginalFields: VC_REMOVE_ORIGINAL_FIELDS,
			domain: verificationOptions.domain,
		};
		const result = await agent.createVerifiablePresentation(presentationOptions);

		return result;
	}

	async verifyPresentation(
		agent: VeramoAgent,
		presentation: VerifiablePresentation | string,
		verificationOptions: VerificationOptions = {}
	): Promise<IVerifyResult> {
		let result: IVerifyResult;
		// Decode presentation if it is a string
		if (typeof presentation === 'string') {
			presentation = jwtDecode(presentation) as VerifiablePresentation;
		}

		// decode credentials if they are JWTs
		if (presentation.verifiableCredential) {
			presentation.verifiableCredential = presentation.verifiableCredential.map((credential) => {
				if (typeof credential === 'object') {
					return credential;
				}
				return jwtDecode(credential) as VerifiableCredential;
			});
		}
		if (verificationOptions.verifyStatus) {
			result = await agent.cheqdVerifyPresentation({
				presentation: presentation as VerifiablePresentation,
				fetchList: true,
				verificationArgs: {
					...verificationOptions,
				},
			} as ICheqdVerifyPresentationWithStatusListArgs);
		} else {
			result = await agent.verifyPresentation({
				presentation,
				...verificationOptions,
				policies: {
					...verificationOptions.policies,
					credentialStatus: true,
				},
			});
		}

		if (result.didResolutionResult) {
			delete result.didResolutionResult;
		}

		if (result.jwt) {
			delete result.jwt;
		}

		if (result.verifiablePresentation) {
			delete result.verifiablePresentation;
		}

		if (result.payload) {
			delete result.payload;
		}

		return result;
	}

	async createUnencryptedStatusList2021(
		agent: VeramoAgent,
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateUnencryptedStatusListOptions
	) {
		const [kms] = await agent.keyManagerGetKeyManagementSystems();

		if (!resourceOptions.name) {
			throw new Error(`createUnencryptedStatusList2021: status list name is required`);
		}
		return await agent.cheqdCreateStatusList2021({
			kms,
			issuerDid: did,
			statusListName: resourceOptions.name,
			statusPurpose: statusOptions.statusPurpose || DefaultStatusList2021StatusPurposeTypes.revocation,
			statusListEncoding: statusOptions.encoding || DefaultStatusListEncodings.base64url,
			statusListLength: statusOptions.length,
			resourceVersion: resourceOptions.version,
			encrypted: false,
		} satisfies ICheqdCreateStatusList2021Args);
	}
	async createUnencryptedBitstringStatusList(
		agent: VeramoAgent,
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateUnencryptedBitstringOptions
	) {
		const [kms] = await agent.keyManagerGetKeyManagementSystems();

		if (!resourceOptions.name) {
			throw new Error(`createUnencryptedBitstringStatusList: status list name is required`);
		}
		return await agent.cheqdCreateStatusList({
			kms,
			issuerDid: did,
			statusListName: resourceOptions.name,
			statusPurpose: statusOptions.statusPurpose || BitstringStatusPurposeTypes.message,
			statusSize: statusOptions.size || 1,
			statusMessages: statusOptions.statusMessages,
			ttl: statusOptions.ttl,
			statusListEncoding: statusOptions.encoding || DefaultStatusListEncodings.base64url,
			statusListLength: statusOptions.length,
			resourceVersion: resourceOptions.version,
			alsoKnownAs: resourceOptions.alsoKnownAs,
			encrypted: false,
		} satisfies ICheqdCreateBitstringStatusListArgs);
	}

	async createEncryptedStatusList2021(
		agent: VeramoAgent,
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateEncryptedStatusListOptions
	) {
		const [kms] = await agent.keyManagerGetKeyManagementSystems();

		if (!resourceOptions.name) {
			throw new Error(`createEncryptedStatusList2021: status list name is required`);
		}

		// construct payment conditions
		const paymentConditions = (
			statusOptions?.paymentConditions
				? statusOptions.paymentConditions.map((condition) => {
						return {
							type: 'timelockPayment',
							feePaymentAddress: condition.feePaymentAddress,
							feePaymentAmount: `${toMinimalDenom(condition.feePaymentAmount)}${MINIMAL_DENOM}`,
							intervalInSeconds: condition.feePaymentWindow * 60,
						};
					})
				: (function () {
						// validate relevant components - case: feePaymentAddress
						if (!statusOptions.feePaymentAddress)
							throw new Error('createEncryptedStatusList2021: feePaymentAddress is required');

						// validate relevant components - case: feePaymentAmount
						if (!statusOptions.feePaymentAmount)
							throw new Error('createEncryptedStatusList2021: feePaymentAmount is required');

						// validate relevant components - case: feePaymentWindow
						if (!statusOptions.feePaymentWindow)
							throw new Error('createEncryptedStatusList2021: feePaymentWindow is required');

						return [
							{
								type: 'timelockPayment',
								feePaymentAddress: statusOptions.feePaymentAddress,
								feePaymentAmount: `${toMinimalDenom(statusOptions.feePaymentAmount)}${MINIMAL_DENOM}`,
								intervalInSeconds: statusOptions.feePaymentWindow * 60,
							},
						];
					})()
		) satisfies PaymentCondition[];

		return await agent.cheqdCreateStatusList2021({
			kms,
			issuerDid: did,
			statusListName: resourceOptions.name,
			statusPurpose: statusOptions.statusPurpose || DefaultStatusList2021StatusPurposeTypes.revocation,
			statusListEncoding: statusOptions.encoding || DefaultStatusListEncodings.base64url,
			statusListLength: statusOptions.length,
			resourceVersion: resourceOptions.version,
			encrypted: true,
			paymentConditions,
			returnSymmetricKey: true,
			dkgOptions: toDefaultDkg(did),
		} satisfies ICheqdCreateStatusList2021Args);
	}
	async createEncryptedBitstringStatusList(
		agent: VeramoAgent,
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateEncryptedBitstringOptions
	) {
		const [kms] = await agent.keyManagerGetKeyManagementSystems();

		if (!resourceOptions.name) {
			throw new Error(`createEncryptedBitstringStatusList: status list name is required`);
		}
		// construct payment conditions
		const paymentConditions = (
			statusOptions?.paymentConditions
				? statusOptions.paymentConditions.map((condition) => {
						return {
							type: 'timelockPayment',
							feePaymentAddress: condition.feePaymentAddress,
							feePaymentAmount: `${toMinimalDenom(condition.feePaymentAmount)}${MINIMAL_DENOM}`,
							intervalInSeconds: condition.feePaymentWindow * 60,
						};
					})
				: (function () {
						// validate relevant components - case: feePaymentAddress
						if (!statusOptions.feePaymentAddress)
							throw new Error('createEncryptedBitstringStatusList: feePaymentAddress is required');

						// validate relevant components - case: feePaymentAmount
						if (!statusOptions.feePaymentAmount)
							throw new Error('createEncryptedBitstringStatusList: feePaymentAmount is required');

						// validate relevant components - case: feePaymentWindow
						if (!statusOptions.feePaymentWindow)
							throw new Error('createEncryptedBitstringStatusList: feePaymentWindow is required');

						return [
							{
								type: 'timelockPayment',
								feePaymentAddress: statusOptions.feePaymentAddress,
								feePaymentAmount: `${toMinimalDenom(statusOptions.feePaymentAmount)}${MINIMAL_DENOM}`,
								intervalInSeconds: statusOptions.feePaymentWindow * 60,
							},
						];
					})()
		) satisfies PaymentCondition[];
		return await agent.cheqdCreateStatusList({
			kms,
			issuerDid: did,
			statusListName: resourceOptions.name,
			statusPurpose: statusOptions.statusPurpose || BitstringStatusPurposeTypes.message,
			statusSize: statusOptions.size || 1,
			statusMessages: statusOptions.statusMessages,
			ttl: statusOptions.ttl,
			statusListEncoding: statusOptions.encoding || DefaultStatusListEncodings.base64url,
			statusListLength: statusOptions.length,
			resourceVersion: resourceOptions.version,
			alsoKnownAs: resourceOptions.alsoKnownAs,
			encrypted: true,
			paymentConditions,
			returnSymmetricKey: true,
			dkgOptions: toDefaultDkg(did),
		} satisfies ICheqdCreateBitstringStatusListArgs);
	}

	async broadcastStatusList2021(
		agent: VeramoAgent,
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: BroadcastStatusListOptions
	) {
		const [kms] = await agent.keyManagerGetKeyManagementSystems();

		if (!resourceOptions.data) {
			throw new Error(`StatusList data is required`);
		}

		return await agent.cheqdBroadcastStatusList2021({
			kms,
			payload: {
				...resourceOptions,
				collectionId: did.split(':')[3],
				data: resourceOptions.data,
				resourceType:
					statusOptions.statusPurpose === 'revocation'
						? DefaultStatusList2021ResourceTypes.revocation
						: DefaultStatusList2021ResourceTypes.suspension,
			},
			network: did.split(':')[2] as CheqdNetwork,
		} satisfies ICheqdBroadcastStatusListArgs);
	}

	async broadcastBitstringStatusList(agent: VeramoAgent, did: string, resourceOptions: ResourcePayload) {
		const [kms] = await agent.keyManagerGetKeyManagementSystems();

		if (!resourceOptions.data) {
			throw new Error(`StatusList data is required`);
		}

		return await agent.cheqdBroadcastStatusList({
			kms,
			payload: {
				...resourceOptions,
				collectionId: did.split(':')[3],
				data: resourceOptions.data,
				resourceType: BitstringStatusListResourceType,
			},
			network: did.split(':')[2] as CheqdNetwork,
		} satisfies ICheqdBroadcastStatusListArgs);
	}

	async remunerateStatusList2021(
		agent: VeramoAgent,
		feePaymentOptions: FeePaymentOptions
	): Promise<TransactionResult> {
		return await agent.cheqdTransactSendTokens({
			recipientAddress: feePaymentOptions.feePaymentAddress,
			amount: toCoin(feePaymentOptions.feePaymentAmount),
			network: feePaymentOptions.feePaymentNetwork,
			memo: feePaymentOptions.memo,
			returnTxResponse: true,
		});
	}

	async revokeCredentials(
		agent: VeramoAgent,
		credentials: W3CVerifiableCredential | W3CVerifiableCredential[],
		publish = true,
		symmetricKey = ''
	) {
		if (Array.isArray(credentials))
			return await agent.cheqdRevokeCredentials({
				credentials,
				fetchList: true,
				publish: true,
			} satisfies ICheqdRevokeBulkCredentialsWithStatusListArgs);
		return await agent.cheqdRevokeCredential({
			credential: credentials,
			fetchList: true,
			publish,
			symmetricKey,
			returnStatusListMetadata: true,
			returnUpdatedStatusList: true,
		});
	}

	async suspendCredentials(
		agent: VeramoAgent,
		credentials: W3CVerifiableCredential | W3CVerifiableCredential[],
		publish = true,
		symmetricKey = ''
	) {
		if (Array.isArray(credentials))
			return await agent.cheqdSuspendCredentials({ credentials, fetchList: true, publish });
		return await agent.cheqdSuspendCredential({
			credential: credentials,
			fetchList: true,
			publish,
			symmetricKey,
			returnStatusListMetadata: true,
			returnUpdatedStatusList: true,
		});
	}

	async unsuspendCredentials(
		agent: VeramoAgent,
		credentials: W3CVerifiableCredential | W3CVerifiableCredential[],
		publish = true,
		symmetricKey = ''
	) {
		if (Array.isArray(credentials))
			return await agent.cheqdUnsuspendCredentials({ credentials, fetchList: true, publish });
		return await agent.cheqdUnsuspendCredential({
			credential: credentials,
			fetchList: true,
			publish,
			symmetricKey,
			returnStatusListMetadata: true,
			returnUpdatedStatusList: true,
		});
	}

	async updateUnencryptedStatusList2021(
		agent: VeramoAgent,
		did: string,
		statusOptions: UpdateUnencryptedStatusListOptions
	) {
		switch (statusOptions.statusAction) {
			case DefaultStatusActions.revoke:
				return await agent.cheqdRevokeCredentials({
					revocationOptions: {
						issuerDid: did,
						statusListIndices: statusOptions.indices,
						statusListName: statusOptions.statusListName,
						statusListVersion: statusOptions.statusListVersion,
					},
					fetchList: true,
					publish: true,
					publishEncrypted: false,
					returnUpdatedStatusList: true,
					returnStatusListMetadata: true,
				} satisfies ICheqdRevokeBulkCredentialsWithStatusListArgs);
			case DefaultStatusActions.suspend:
				return await agent.cheqdSuspendCredentials({
					suspensionOptions: {
						issuerDid: did,
						statusListIndices: statusOptions.indices,
						statusListName: statusOptions.statusListName,
						statusListVersion: statusOptions.statusListVersion,
					},
					fetchList: true,
					publish: true,
					publishEncrypted: false,
					returnUpdatedStatusList: true,
					returnStatusListMetadata: true,
				} satisfies ICheqdSuspendBulkCredentialsWithStatusListArgs);
			case DefaultStatusActions.reinstate:
				return await agent.cheqdUnsuspendCredentials({
					unsuspensionOptions: {
						issuerDid: did,
						statusListIndices: statusOptions.indices,
						statusListName: statusOptions.statusListName,
						statusListVersion: statusOptions.statusListVersion,
					},
					fetchList: true,
					publish: true,
					publishEncrypted: false,
					returnUpdatedStatusList: true,
					returnStatusListMetadata: true,
				} satisfies ICheqdUnsuspendBulkCredentialsWithStatusListArgs);
		}
	}

	async updateEncryptedStatusList2021(
		agent: VeramoAgent,
		did: string,
		statusOptions: UpdateEncryptedStatusListOptions
	) {
		// construct payment conditions
		const paymentConditions = (
			statusOptions?.paymentConditions
				? statusOptions.paymentConditions.map((condition) => {
						return {
							feePaymentAddress: condition.feePaymentAddress,
							feePaymentAmount: `${toMinimalDenom(condition.feePaymentAmount)}${MINIMAL_DENOM}`,
							intervalInSeconds: condition.feePaymentWindow * 60,
							type: 'timelockPayment',
						};
					})
				: (function () {
						// validate relevant components
						if (
							!statusOptions.feePaymentAddress &&
							!statusOptions.feePaymentAmount &&
							!statusOptions.feePaymentWindow
						)
							return undefined;

						// validate relevant components - case: feePaymentAddress
						if (!statusOptions.feePaymentAddress)
							throw new Error('updateEncryptedStatusList2021: feePaymentAddress is required');

						// validate relevant components - case: feePaymentAmount
						if (!statusOptions.feePaymentAmount)
							throw new Error('updateEncryptedStatusList2021: feePaymentAmount is required');

						// validate relevant components - case: feePaymentWindow
						if (!statusOptions.feePaymentWindow)
							throw new Error('updateEncryptedStatusList2021: feePaymentWindow is required');

						return [
							{
								feePaymentAddress: statusOptions.feePaymentAddress,
								feePaymentAmount: `${toMinimalDenom(statusOptions.feePaymentAmount)}${MINIMAL_DENOM}`,
								intervalInSeconds: statusOptions.feePaymentWindow * 60,
								type: 'timelockPayment',
							},
						];
					})()
		) satisfies PaymentCondition[] | undefined;

		switch (statusOptions.statusAction) {
			case DefaultStatusActions.revoke:
				return await agent.cheqdRevokeCredentials({
					revocationOptions: {
						issuerDid: did,
						statusListIndices: statusOptions.indices,
						statusListName: statusOptions.statusListName,
						statusListVersion: statusOptions.statusListVersion,
					},
					symmetricKey: statusOptions.symmetricKey,
					paymentConditions,
					fetchList: true,
					publish: true,
					publishEncrypted: true,
					returnSymmetricKey: true,
					returnUpdatedStatusList: true,
					returnStatusListMetadata: true,
					dkgOptions: toDefaultDkg(did),
				} satisfies ICheqdRevokeBulkCredentialsWithStatusListArgs);
			case DefaultStatusActions.suspend:
				return await agent.cheqdSuspendCredentials({
					suspensionOptions: {
						issuerDid: did,
						statusListIndices: statusOptions.indices,
						statusListName: statusOptions.statusListName,
						statusListVersion: statusOptions.statusListVersion,
					},
					symmetricKey: statusOptions.symmetricKey,
					paymentConditions,
					fetchList: true,
					publish: true,
					publishEncrypted: true,
					returnSymmetricKey: true,
					returnUpdatedStatusList: true,
					returnStatusListMetadata: true,
					dkgOptions: toDefaultDkg(did),
				} satisfies ICheqdSuspendBulkCredentialsWithStatusListArgs);
			case DefaultStatusActions.reinstate:
				return await agent.cheqdUnsuspendCredentials({
					unsuspensionOptions: {
						issuerDid: did,
						statusListIndices: statusOptions.indices,
						statusListName: statusOptions.statusListName,
						statusListVersion: statusOptions.statusListVersion,
					},
					symmetricKey: statusOptions.symmetricKey,
					paymentConditions,
					fetchList: true,
					publish: true,
					publishEncrypted: true,
					returnSymmetricKey: true,
					returnUpdatedStatusList: true,
					returnStatusListMetadata: true,
					dkgOptions: toDefaultDkg(did),
				} satisfies ICheqdUnsuspendBulkCredentialsWithStatusListArgs);
		}
	}

	async checkStatusList2021(agent: VeramoAgent, did: string, statusOptions: CheckStatusListOptions) {
		return await agent.cheqdCheckCredentialStatus({
			statusOptions: {
				issuerDid: did,
				...statusOptions,
			},
			fetchList: true,
			dkgOptions: toDefaultDkg(did),
		} satisfies ICheqdCheckCredentialStatusWithStatusListArgs);
	}

	async searchStatusList(
		did: string,
		statusListName: string,
		listType: string,
		statusPurpose: DefaultStatusList2021StatusPurposeType
	): Promise<SearchStatusListResult> {
		let resourceType: string;
		if (listType === 'BitstringStatusList') {
			resourceType = BitstringStatusListResourceType;
		} else {
			resourceType = DefaultStatusList2021ResourceTypes[statusPurpose];
		}
		// construct url
		const url = new URL(
			`${process.env.RESOLVER_URL || DefaultResolverUrl}${did}?resourceName=${statusListName}&resourceType=${
				resourceType
			}`
		);

		try {
			// fetch resource metadata
			const resourceMetadataVersioned = (await (
				await fetch(url, {
					headers: {
						Accept: 'application/ld+json;profile=https://w3id.org/did-resolution',
					},
				})
			).json()) as DIDResolutionResult;

			// define arbitrary error
			const arbitraryError = resourceMetadataVersioned?.didResolutionMetadata?.error;

			// handle error
			if (arbitraryError) {
				return {
					found: false,
					error: arbitraryError,
				};
			}

			// early return, if no resource metadata
			if (!resourceMetadataVersioned?.didDocumentMetadata?.linkedResourceMetadata)
				return { found: false, error: 'notFound' } satisfies SearchStatusListResult;

			// get latest resource version by nextVersionId null pointer, or by latest created date as fallback
			const resourceMetadata =
				resourceMetadataVersioned.didDocumentMetadata.linkedResourceMetadata.find(
					(resource: any) => !resource.nextVersionId
				) ||
				resourceMetadataVersioned.didDocumentMetadata.linkedResourceMetadata.sort(
					(a: any, b: any) => new Date(b.created).getTime() - new Date(a.created).getTime()
				)[0];

			// unset resourceMetadata
			url.searchParams.delete('resourceMetadata');

			// fetch resource
			const resource = (await (await fetch(url)).json()) as StatusList2021Revocation | StatusList2021Suspension;

			// return result
			return {
				found: true,
				resource,
				resourceMetadata,
			} satisfies SearchStatusListResult;
		} catch (error) {
			// silent fail
			console.error(`searchStatusList: fetch: failed: ${error}`);

			// return result
			return {
				found: false,
				error: (error as Record<string, unknown>).toString(),
			} satisfies SearchStatusListResult;
		}
	}
}
