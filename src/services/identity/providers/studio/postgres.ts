import type {
	CredentialPayload,
	DIDDocument,
	IIdentifier,
	IKey,
	IVerifyResult,
	PresentationPayload,
	VerifiableCredential,
	VerifiablePresentation,
	W3CVerifiableCredential,
} from '@veramo/core';
import type { AbstractPrivateKeyStore, ManagedPrivateKey } from '@veramo/key-manager';
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local';
import { PrivateKeyStore } from '@veramo/data-store';
import {
	Cheqd,
	CheqdDIDProvider,
	type ResourcePayload,
	type BulkRevocationResult,
	type BulkSuspensionResult,
	type BulkUnsuspensionResult,
	type CreateStatusList2021Result,
	type StatusCheckResult,
	DefaultRPCUrls,
	type TransactionResult,
} from '@cheqd/did-provider-cheqd';
import { DefaultDidUrlPattern, VeramoAgent } from '../../../../types/shared.js';
import type { VerificationOptions } from '../../../../types/shared.js';
import type {
	CreateEncryptedBitstringOptions,
	CreateUnencryptedBitstringOptions,
	FeePaymentOptions,
} from '../../../../types/credential-status.js';
import type {
	CredentialRequest,
	ListCredentialRequestOptions,
	ListCredentialResponse,
} from '../../../../types/credential.js';
import type { CheckStatusListOptions } from '../../../../types/credential-status.js';
import type { StatusOptions } from '../../../../types/credential-status.js';
import type {
	BroadcastStatusListOptions,
	CreateUnencryptedStatusListOptions,
	UpdateUnencryptedStatusListOptions,
	CreateEncryptedStatusListOptions,
	UpdateEncryptedStatusListOptions,
} from '../../../../types/credential-status.js';
import { Connection } from '../../../../database/connection/connection.js';
import type { CustomerEntity } from '../../../../database/entities/customer.entity.js';
import { Veramo } from './agent.js';
import { DefaultIdentityService } from '../../default.js';
import * as dotenv from 'dotenv';
import { KeyService } from '../../../api/key.js';
import { PaymentAccountService } from '../../../api/payment-account.js';
import { CheqdNetwork, toMultibaseRaw, VerificationMethod } from '@cheqd/sdk';
import { IdentifierService } from '../../../api/identifier.js';
import type { KeyEntity } from '../../../../database/entities/key.entity.js';
import type { UserEntity } from '../../../../database/entities/user.entity.js';
import { APIKeyService } from '../../../admin/api-key.js';
import type { APIKeyEntity } from '../../../../database/entities/api.key.entity.js';
import { KeyDIDProvider } from '@veramo/did-provider-key';
import type { AbstractIdentifierProvider } from '@veramo/did-manager';
import type { BulkBitstringUpdateResult, CheqdProviderError, CreateStatusListResult } from '@cheqd/did-provider-cheqd';
import type { TPublicKeyEd25519 } from '@cheqd/did-provider-cheqd';
import { toTPublicKeyEd25519 } from '../../../helpers.js';
import type { APIServiceOptions } from '../../../../types/admin.js';
import { extractPublicKeyHex, bytesToBase58, SupportedKeyTypes } from '@veramo/utils';
import { PaymentAccountEntity } from '../../../../database/entities/payment.account.entity.js';
import { LocalStore } from '../../../../database/cache/store.js';
import { ResourceService } from '../../../api/resource.js';
import { FindOptionsRelations, FindOptionsWhere, LessThanOrEqual } from 'typeorm';
import { IdentifierEntity } from '../../../../database/entities/identifier.entity.js';
import { ListDIDRequestOptions } from '../../../../types/did.js';
import { ListResourceOptions, ListResourceResponse } from '../../../../types/resource.js';
import { ResourceEntity } from '../../../../database/entities/resource.entity.js';
import { OperationService } from '../../../api/operation.js';
import { ListOperationOptions } from '../../../../types/track.js';
import { DIDAccreditationTypes } from '../../../../types/accreditation.js';
import { JWT_PROOF_TYPE } from '../../../../types/constants.js';
import { fromString } from 'uint8arrays';

dotenv.config();

const { MAINNET_RPC_URL, TESTNET_RPC_URL, EXTERNAL_DB_ENCRYPTION_KEY } = process.env;

export class PostgresIdentityService extends DefaultIdentityService {
	privateStore?: AbstractPrivateKeyStore;

	constructor() {
		super();
		this.agent = this.initAgent();
	}

	initAgent() {
		if (this.agent) return this.agent;
		const dbConnection = Connection.instance.dbConnection;
		this.privateStore = new PrivateKeyStore(dbConnection, new SecretBox(EXTERNAL_DB_ENCRYPTION_KEY));

		this.agent = Veramo.instance.createVeramoAgent({
			dbConnection,
			kms: {
				postgres: new KeyManagementSystem(this.privateStore),
			},
			providers: {},
			enableCredential: false,
			enableResolver: true,
		});
		return this.agent;
	}

	async createCheqdProvider(
		customer: CustomerEntity,
		namespace: CheqdNetwork,
		paymentAccounts: PaymentAccountEntity[]
	): Promise<CheqdDIDProvider | undefined> {
		let rpcUrl = '';
		if (namespace === CheqdNetwork.Mainnet) {
			rpcUrl = MAINNET_RPC_URL || DefaultRPCUrls.mainnet;
		} else {
			rpcUrl = TESTNET_RPC_URL || DefaultRPCUrls.testnet;
		}
		const paymentAccount = paymentAccounts.find((acc) => acc.namespace === namespace);
		if (paymentAccount === undefined) {
			return undefined;
		}

		const privateKey = (await this.getPrivateKey(paymentAccount.key.kid))?.privateKeyHex;

		if (!privateKey) {
			throw new Error(`No keys is initialized`);
		}

		return new CheqdDIDProvider({
			defaultKms: 'postgres',
			cosmosPayerSeed: privateKey,
			networkType: namespace,
			rpcUrl: rpcUrl,
		});
	}

	async createAgent(customer: CustomerEntity): Promise<VeramoAgent> {
		const providers: Record<string, AbstractIdentifierProvider> = {};
		const cheqdProviders: CheqdDIDProvider[] = [];

		if (!this.privateStore) {
			throw new Error(`No keys is initialized`);
		}
		if (!customer) {
			throw new Error('customer is not specified');
		}
		const dbConnection = Connection.instance.dbConnection;

		const cachedAccounts = LocalStore.instance.getCustomerAccounts(customer.customerId);
		let paymentAccounts: PaymentAccountEntity[];
		if (cachedAccounts?.length == 2) {
			paymentAccounts = cachedAccounts;
		} else {
			paymentAccounts = await PaymentAccountService.instance.find({ customer }, { key: true });

			if (paymentAccounts.length > 0) {
				LocalStore.instance.setCustomerAccounts(customer.customerId, paymentAccounts);
			}
		}

		// One customer may / may not have one Mainnet paymentAccount
		const providerMainnet = await this.createCheqdProvider(customer, CheqdNetwork.Mainnet, paymentAccounts);
		// One customer may / may not have one Testnet paymentAccount
		const providerTestnet = await this.createCheqdProvider(customer, CheqdNetwork.Testnet, paymentAccounts);
		// did:key provider
		providers['did:key'] = new KeyDIDProvider({ defaultKms: 'postgres' });
		if (providerMainnet) {
			providers['did:cheqd:mainnet'] = providerMainnet;
			cheqdProviders.push(providerMainnet);
		}
		if (providerTestnet) {
			providers['did:cheqd:testnet'] = providerTestnet;
			cheqdProviders.push(providerTestnet);
		}
		return Veramo.instance.createVeramoAgent({
			dbConnection,
			kms: {
				postgres: new KeyManagementSystem(this.privateStore),
			},
			providers: providers,
			cheqdProviders: cheqdProviders,
			enableCredential: true,
			enableResolver: true,
		});
	}

	async createKey(type: SupportedKeyTypes = SupportedKeyTypes.Ed25519, customer?: CustomerEntity, keyAlias?: string) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const key = await Veramo.instance.createKey(this.agent!, type);
		// Update our specific key columns
		return await KeyService.instance.update(key.kid, customer, keyAlias, new Date());
	}

	async importKey(
		type: SupportedKeyTypes = SupportedKeyTypes.Ed25519,
		privateKeyHex: string,
		customer?: CustomerEntity,
		keyAlias?: string
	) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const key = await Veramo.instance.importKey(this.agent!, type, privateKeyHex);
		// Update our specific key columns
		return await KeyService.instance.update(key.kid, customer, keyAlias, new Date());
	}

	async getKey(kid: string, customer: CustomerEntity) {
		const keys = await KeyService.instance.find({ kid: kid, customer: customer });
		if (!keys || keys.length == 0) {
			return null;
		}
		// It's super-strange to have more than one key with the same kid
		if (keys.length > 1) {
			throw new Error(`More than one key with kid ${kid} found`);
		}
		return keys[0];
	}

	async createPaymentAccount(namespace: string, customer: CustomerEntity, key: KeyEntity, isDefault = false) {
		return await PaymentAccountService.instance.create(namespace, isDefault, customer, key);
	}

	async updatePaymentAccount(
		address: string,
		namespace?: string,
		isDefault?: boolean,
		customer?: CustomerEntity,
		key?: KeyEntity
	) {
		return await PaymentAccountService.instance.update(address, namespace, isDefault, customer, key);
	}

	async getPaymentAccount(address: string) {
		return await PaymentAccountService.instance.get(address, { key: true });
	}

	async findPaymentAccount(where: Record<string, unknown>) {
		return await PaymentAccountService.instance.find(where);
	}

	private async getPrivateKey(kid: string): Promise<ManagedPrivateKey | null> {
		return (await this.privateStore?.getKey({ alias: kid })) || null;
	}

	async createDid(network: string, didDocument: DIDDocument, customer: CustomerEntity): Promise<IIdentifier> {
		if (!customer) {
			throw new Error('Customer not found');
		}
		try {
			const agent = await this.createAgent(customer);
			const identifier: IIdentifier = await Veramo.instance.createDid(agent, network, didDocument);
			// Update our specific identifier columns
			await IdentifierService.instance.update(identifier.did, customer);
			return identifier;
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async updateDid(
		didDocument: DIDDocument,
		customer: CustomerEntity,
		publicKeyHexs?: string[]
	): Promise<IIdentifier> {
		if (!customer) {
			throw new Error('Customer not found');
		}
		if (!(await IdentifierService.instance.find({ did: didDocument.id, customer: customer }))) {
			throw new Error(`${didDocument.id} not found in wallet`);
		}
		try {
			const agent = await this.createAgent(customer);
			const publicKeys: TPublicKeyEd25519[] =
				publicKeyHexs?.map((key) => {
					return toTPublicKeyEd25519(key);
				}) || [];
			const identifier: IIdentifier = await Veramo.instance.updateDid(agent, didDocument, publicKeys);
			return identifier;
		} catch (error) {
			const errorCode = (error as CheqdProviderError).errorCode;
			// Handle specific cases when DID is deactivated or verificationMethod is empty
			if (errorCode) {
				throw error;
			}
			throw new Error(`${error}`);
		}
	}

	async deactivateDid(did: string, customer: CustomerEntity, publicKeyHexs?: string[]): Promise<boolean> {
		if (!customer) {
			throw new Error('Customer not found');
		}
		if (!(await IdentifierService.instance.find({ did: did, customer: customer }))) {
			throw new Error(`${did} not found in wallet`);
		}
		try {
			const agent = await this.createAgent(customer);
			const publicKeys: TPublicKeyEd25519[] =
				publicKeyHexs?.map((key) => {
					return toTPublicKeyEd25519(key);
				}) || [];
			return await Veramo.instance.deactivateDid(agent, did, publicKeys);
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async listDids(options: ListDIDRequestOptions, customer: CustomerEntity) {
		if (!customer) {
			throw new Error('Customer not found');
		}

		const where: FindOptionsWhere<IdentifierEntity> = { customer };
		if (options.network) {
			where.provider = `did:cheqd:${options.network}`;
		}

		if (options.createdAt) {
			where.saveDate = LessThanOrEqual(new Date(options.createdAt));
		}

		const [entities, total] = await IdentifierService.instance.find(
			where,
			options.page,
			options.limit,
			options.metadata === 'true'
				? {
						services: true,
					}
				: undefined
		);
		if (options.metadata === 'true') {
			entities.forEach(
				(e) =>
					(e.services = e.services.map((s) => {
						s.serviceEndpoint =
							typeof s.serviceEndpoint === 'string' && /^[{\[]/.test(s.serviceEndpoint.trim())
								? JSON.parse(s.serviceEndpoint)
								: s.serviceEndpoint;
						return s;
					}))
			);
			return { total, dids: entities };
		}
		return { total, dids: entities.map((entity) => entity.did) };
	}

	async getDid(did: string) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return await Veramo.instance.getDid(this.agent!, did);
	}

	async importDid(
		did: string,
		keys: Pick<IKey, 'privateKeyHex' | 'type'>[],
		controllerKeyId: string | undefined,
		customer: CustomerEntity,
		provider?: string
	): Promise<IIdentifier> {
		if (!did.match(DefaultDidUrlPattern)) {
			throw new Error('Invalid DID');
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const identifier: IIdentifier = await Veramo.instance.importDid(
			this.agent!,
			did,
			keys,
			controllerKeyId,
			provider
		);
		await IdentifierService.instance.update(identifier.did, customer);
		return identifier;
	}

	async exportDid(did: string, password: string, customer: CustomerEntity): Promise<any> {
		if (!customer) {
			throw new Error('Customer not found');
		}
		const identifier = await IdentifierService.instance.get(did, customer, { keys: true });
		if (!identifier) {
			throw new Error(`${did} not found in wallet`);
		}
		const keys = identifier.keys;
		const { didDocument, didDocumentMetadata, didResolutionMetadata } = await this.resolveDid(did);
		if (!didDocument) {
			throw new Error(`Error resolving ${did}`);
		}

		// Step 1: Fetch private keys for each verification method
		const didKeyDocumentsWithPrivateKey = await Promise.all(
			(didDocument.verificationMethod || []).map(async (vm: VerificationMethod, index: number) => {
				// Extract kid (publicKeyHex) from vm
				const kid = extractPublicKeyHex(vm).publicKeyHex;
				if (!kid) {
					throw new Error('Not supported');
				}

				// Ensure the key exists
				const existingKey = keys.find((k) => k.kid === kid);
				if (!existingKey) {
					throw new Error(`Key not found in wallet: ${kid}`);
				}

				// Get private key
				const keyDoc = await this.getPrivateKey(kid);
				if (!keyDoc) {
					throw new Error(`Private key not found for kid: ${kid}`);
				}

				const publicKeyBytes = fromString(existingKey.publicKeyHex, 'hex');
				const privateKeyBytes = fromString(keyDoc.privateKeyHex, 'hex');

				// Build DID key document with private key
				return {
					'@context': ['https://w3id.org/wallet/v1'],
					id: vm.id, // keep the same ID as DID Doc
					type: [vm.type],
					controller: vm.id,
					name: keyDoc.alias,
					correlation: [vm.id],
					created: new Date().toISOString(),
					publicKeyMultibase: toMultibaseRaw(publicKeyBytes),
					privateKeyMultibase: toMultibaseRaw(privateKeyBytes),
					publicKeyBase58: bytesToBase58(publicKeyBytes),
					privateKeyBase58: bytesToBase58(privateKeyBytes),
				};
			})
		);

		// Build DID resolution response
		const didResolutionResponseDocument = {
			'@context': ['https://w3id.org/wallet/v1', 'https://w3id.org/did-resolution/v1'],
			id: did,
			type: ['DIDResolutionResponse'],
			didDocument,
			didDocumentMetadata,
			didResolutionMetadata,
		};

		return {
			...didResolutionResponseDocument,
			keys: didKeyDocumentsWithPrivateKey,
		};
	}

	async createResource(
		network: string,
		payload: ResourcePayload,
		customer: CustomerEntity,
		publicKeyHexs?: string[]
	) {
		try {
			const agent = await this.createAgent(customer);
			const did = `did:cheqd:${network}:${payload.collectionId}`;
			if (!(await IdentifierService.instance.find({ did: did, customer: customer }))) {
				throw new Error(`${did} not found in wallet`);
			}
			const publicKeys: TPublicKeyEd25519[] =
				publicKeyHexs?.map((key) => {
					return toTPublicKeyEd25519(key);
				}) || [];
			return await Veramo.instance.createResource(agent, network, payload, publicKeys);
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async listResources(options: ListResourceOptions, customer: CustomerEntity): Promise<ListResourceResponse> {
		if (!customer) {
			throw new Error('Customer not found');
		}
		try {
			const filter: Record<string, any> = {
				resourceName: options.resourceName,
				resourceType: options.resourceType,
				createdAt: options.createdAt ? LessThanOrEqual(options.createdAt) : undefined,
				customer: customer,
				encrypted: options.encrypted,
			};

			let relations: FindOptionsRelations<ResourceEntity | undefined> = {
				identifier: true,
			};
			if (options.did || options.network) {
				filter.identifier = {
					...(options.did && { did: options.did }),
					...(options.network && { provider: `did:cheqd:${options.network}` }),
				};
			}

			const [resources, total] = await ResourceService.instance.find(
				filter,
				options.page,
				options.limit,
				relations
			);

			return {
				total,
				resources: resources.map((r) => ({
					resourceId: r.resourceId,
					resourceName: r.resourceName,
					resourceType: r.resourceType,
					mediaType: r.mediaType,
					previousVersionId: r.previousVersionId,
					nextVersionId: r.nextVersionId,
					did: r.identifier.did,
					encrypted: r.encrypted,
				})),
			};
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async createCredential(
		credential: CredentialPayload,
		format: CredentialRequest['format'],
		statusOptions: StatusOptions | null,
		customer: CustomerEntity
	): Promise<VerifiableCredential> {
		try {
			const did = typeof credential.issuer == 'string' ? credential.issuer : credential.issuer.id;
			if (!(await IdentifierService.instance.find({ did: did, customer: customer }))) {
				throw new Error(`${did} not found in wallet`);
			}
			const agent = await this.createAgent(customer);
			return await Veramo.instance.issueCredential(agent, credential, format, statusOptions);
		} catch (error) {
			throw new Error(`${error}`);
		}
	}

	async listCredentials(
		options: ListCredentialRequestOptions,
		customer: CustomerEntity
	): Promise<ListCredentialResponse> {
		if (!customer) {
			throw new Error('Customer not found');
		}
		const where: FindOptionsWhere<ResourceEntity>[] = [
			{ customer, resourceType: 'VerifiableCredential' },
			{ customer, resourceType: DIDAccreditationTypes.VerifiableAccreditationToAccredit },
			{ customer, resourceType: DIDAccreditationTypes.VerifiableAccreditationToAttest },
		];

		if (options.issuerId) {
			where.forEach((w) => {
				w.identifier = { did: options.issuerId };
			});
		}

		const [resources, total] = await ResourceService.instance.find(where, options.page, options.limit, {
			identifier: true,
		});

		const credentials = await Promise.all(
			resources.map(async (r) => {
				const res = await this.resolve(`${r.identifier.did}/resources/${r.resourceId}`);
				const data = await res.json();
				return {
					id: `${r.identifier.did}/resources/${r.resourceId}`,
					...data,
				};
			})
		);

		return {
			total,
			credentials: credentials
				.filter((c) => c.credentialSubject)
				.map((credential: VerifiableCredential) => ({
					status: 'issued',
					providerId: 'studio',
					id: credential.id!,
					issuerDid: typeof credential.issuer === 'string' ? credential.issuer : credential.issuer.id,
					subjectDid: credential.credentialSubject.id!,
					type: credential.type || 'VerifiableCredential',
					format: credential.proof.type === JWT_PROOF_TYPE ? 'jwt' : 'jsonld',
					createdAt: credential.issuanceDate,
					expirationDate: credential.expirationDate,
					credentialStatus: credential.credentialStatus,
				})),
		};
	}

	async getCredential(credentialId: string, customer: CustomerEntity): Promise<VerifiableCredential | null> {
		if (!customer) {
			throw new Error('Customer not found');
		}

		// credentialId can be either:
		// 1. Full DID URL: did:cheqd:testnet:xxx/resources/yyy
		// 2. Just the resourceId: yyy

		let resourceId: string;
		let didUrl: string;

		if (credentialId.includes('/resources/')) {
			// Full DID URL provided
			didUrl = credentialId;
			resourceId = credentialId.split('/resources/')[1];
		} else {
			// Just resourceId provided - need to find the resource first
			const resource = await ResourceService.instance.get(credentialId, { identifier: true });
			if (!resource) {
				return null;
			}
			resourceId = resource.resourceId;
			didUrl = `${resource.identifier.did}/resources/${resourceId}`;
		}

		try {
			const res = await this.resolve(didUrl);
			if (!res.ok) {
				return null;
			}
			const credential = await res.json();
			return credential as VerifiableCredential;
		} catch (error) {
			console.error(`Failed to resolve credential ${didUrl}:`, error);
			return null;
		}
	}

	async verifyCredential(
		credential: string | VerifiableCredential,
		verificationOptions: VerificationOptions,
		customer: CustomerEntity
	): Promise<IVerifyResult> {
		const agent = await this.createAgent(customer);
		return await Veramo.instance.verifyCredential(agent, credential, verificationOptions);
	}

	async createPresentation(
		presentation: PresentationPayload,
		verificationOptions: VerificationOptions,
		customer: CustomerEntity
	): Promise<VerifiablePresentation> {
		const agent = await this.createAgent(customer);
		return await Veramo.instance.createPresentation(agent, presentation, verificationOptions);
	}

	async verifyPresentation(
		presentation: VerifiablePresentation | string,
		verificationOptions: VerificationOptions,
		customer: CustomerEntity
	): Promise<IVerifyResult> {
		const agent = await this.createAgent(customer);
		return await Veramo.instance.verifyPresentation(agent, presentation, verificationOptions);
	}

	async createUnencryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateUnencryptedStatusListOptions,
		customer: CustomerEntity
	): Promise<CreateStatusList2021Result> {
		const agent = await this.createAgent(customer);
		return await Veramo.instance.createUnencryptedStatusList2021(agent, did, resourceOptions, statusOptions);
	}
	async createUnencryptedBitstringStatusList(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateUnencryptedBitstringOptions,
		customer: CustomerEntity
	): Promise<CreateStatusListResult> {
		const agent = await this.createAgent(customer);
		return await Veramo.instance.createUnencryptedBitstringStatusList(agent, did, resourceOptions, statusOptions);
	}

	async createEncryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateEncryptedStatusListOptions,
		customer: CustomerEntity
	): Promise<CreateStatusList2021Result> {
		const agent = await this.createAgent(customer);
		return await Veramo.instance.createEncryptedStatusList2021(agent, did, resourceOptions, statusOptions);
	}
	async createEncryptedBitstringStatusList(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateEncryptedBitstringOptions,
		customer: CustomerEntity
	): Promise<CreateStatusListResult> {
		const agent = await this.createAgent(customer);
		return await Veramo.instance.createEncryptedBitstringStatusList(agent, did, resourceOptions, statusOptions);
	}

	async updateUnencryptedStatusList(
		did: string,
		listType: string,
		statusOptions: UpdateUnencryptedStatusListOptions,
		customer: CustomerEntity
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult | BulkBitstringUpdateResult> {
		const agent = await this.createAgent(customer);
		if (!(await IdentifierService.instance.find({ did: did, customer: customer }))) {
			throw new Error(`${did} not found in wallet`);
		}
		return await Veramo.instance.updateUnencryptedStatusList(agent, did, listType, statusOptions);
	}

	async updateEncryptedStatusList(
		did: string,
		listType: string,
		statusOptions: UpdateEncryptedStatusListOptions,
		customer: CustomerEntity
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult | BulkBitstringUpdateResult> {
		const agent = await this.createAgent(customer);
		if (!(await IdentifierService.instance.find({ did: did, customer: customer }))) {
			throw new Error(`${did} not found in wallet`);
		}
		return await Veramo.instance.updateEncryptedStatusList(agent, did, listType, statusOptions);
	}

	async checkStatusList2021(
		did: string,
		statusOptions: CheckStatusListOptions,
		customer: CustomerEntity
	): Promise<StatusCheckResult> {
		const agent = await this.createAgent(customer);
		// ToDo: Should we try to get did from our storage? What if DID is placed on ledger but we don't have it in our own db?
		if (!(await IdentifierService.instance.find({ did: did, customer: customer }))) {
			throw new Error(`${did} not found in wallet`);
		}
		return await Veramo.instance.checkStatusList2021(agent, did, statusOptions);
	}

	async broadcastStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: BroadcastStatusListOptions,
		customer: CustomerEntity
	): Promise<boolean> {
		const agent = await this.createAgent(customer);
		if (!(await IdentifierService.instance.find({ did: did, customer: customer }))) {
			throw new Error(`${did} not found in wallet`);
		}
		return await Veramo.instance.broadcastStatusList2021(agent, did, resourceOptions, statusOptions);
	}

	async remunerateStatusList2021(
		feePaymentOptions: FeePaymentOptions,
		customer: CustomerEntity
	): Promise<TransactionResult> {
		const agent = await this.createAgent(customer);
		return await Veramo.instance.remunerateStatusList2021(agent, feePaymentOptions);
	}

	async revokeCredentials(
		credentials: W3CVerifiableCredential | W3CVerifiableCredential[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	) {
		const agent = await this.createAgent(customer);
		await this.validateCredentialAccess(credentials, customer);
		return await Veramo.instance.revokeCredentials(agent, credentials, listType, publish, symmetricKey);
	}

	async suspendCredentials(
		credentials: W3CVerifiableCredential | W3CVerifiableCredential[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	) {
		const agent = await this.createAgent(customer);
		await this.validateCredentialAccess(credentials, customer);
		return await Veramo.instance.suspendCredentials(agent, credentials, listType, publish, symmetricKey);
	}

	async reinstateCredentials(
		credentials: W3CVerifiableCredential | W3CVerifiableCredential[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	) {
		const agent = await this.createAgent(customer);
		await this.validateCredentialAccess(credentials, customer);
		return await Veramo.instance.unsuspendCredentials(agent, credentials, listType, publish, symmetricKey);
	}

	private async validateCredentialAccess(
		credentials: W3CVerifiableCredential | W3CVerifiableCredential[],
		customer: CustomerEntity
	) {
		credentials = Array.isArray(credentials) ? credentials : [credentials];
		if (!customer) {
			throw new Error('Customer not found');
		}

		for (const credential of credentials) {
			const decodedCredential =
				typeof credential === 'string' ? await Cheqd.decodeCredentialJWT(credential) : credential;

			const issuerId =
				typeof decodedCredential.issuer === 'string' ? decodedCredential.issuer : decodedCredential.issuer.id;

			const existsInWallet = await IdentifierService.instance.find({ did: issuerId, customer: customer });

			if (!existsInWallet) {
				throw new Error(`${issuerId} not found in wallet`);
			}
		}
	}

	async setAPIKey(apiKey: string, customer: CustomerEntity, user: UserEntity): Promise<APIKeyEntity> {
		const options = { decryptionNeeded: true } satisfies APIServiceOptions;
		const keys = await APIKeyService.instance.find(
			{ customer: customer, user: user, revoked: false },
			undefined,
			options
		);
		if (keys.length > 0) {
			throw new Error(`API key for customer ${customer.customerId} and user ${user.logToId} already exists`);
		}
		const apiKeyEntity = await APIKeyService.instance.create(
			apiKey,
			'idToken',
			user,
			customer,
			undefined,
			undefined,
			options
		);
		if (!apiKeyEntity) {
			throw new Error(`Cannot create API key for customer ${customer.customerId} and user ${user.logToId}`);
		}
		return apiKeyEntity;
	}

	async updateAPIKey(apiKey: APIKeyEntity, newApiKey: string): Promise<APIKeyEntity> {
		const options = { decryptionNeeded: true } satisfies APIServiceOptions;
		const key = await APIKeyService.instance.get(apiKey.apiKey, options);
		if (!key) {
			throw new Error(`API key not found`);
		}
		const apiKeyEntity = await APIKeyService.instance.update(
			{
				customer: key.customer,
				apiKey: newApiKey,
				expiresAt: APIKeyService.getExpiryDateJWT(newApiKey),
			},
			options
		);
		if (!apiKeyEntity) {
			throw new Error(`Cannot update API key`);
		}
		return apiKeyEntity;
	}

	async getAPIKey(customer: CustomerEntity, user: UserEntity): Promise<APIKeyEntity | null> {
		const options = { decryptionNeeded: true } satisfies APIServiceOptions;
		const key = await APIKeyService.instance.findOne(
			{ customer: customer, user: user, revoked: false, name: 'idToken' },
			undefined,
			options
		);
		return key;
	}

	async decryptAPIKey(apiKey: string): Promise<string> {
		return await APIKeyService.instance.decryptAPIKey(apiKey);
	}

	async listOperations(options: ListOperationOptions, customer: CustomerEntity) {
		const { page, limit, ...where } = options;
		const [operations, total] = await OperationService.instance.find({ ...where, customer }, page, limit);

		return {
			total,
			events: operations,
		};
	}
}
