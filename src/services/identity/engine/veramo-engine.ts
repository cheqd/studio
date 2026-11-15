/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CustomerEntity } from '../../../database/entities/customer.entity.js';
import type { KeyEntity } from '../../../database/entities/key.entity.js';
import type { ExportDidResponse, ListDIDRequestOptions, ListDidsResponseBody } from '../../../types/did.js';
import type {
	CredentialRequest,
	ListCredentialRequestOptions,
	ListCredentialResponse,
} from '../../../types/credential.js';
import type { ListResourceOptions, ListResourceResponse } from '../../../types/resource.js';
import type { IIdentityService } from '../index.js';
import type { IdentityEngine } from './identity-engine.js';
import { walkAccreditationChain } from './accreditation-chain.js';
import { veramoAccreditationPorts } from './veramo-accreditation.js';
import { networkOfCredential, networkOfDid } from './veramo-payer-lock.js';
import type { VeramoPayerLock } from './veramo-payer-lock.js';
import type {
	EngineAccreditationOutcome,
	EngineAccreditationVerifyRequest,
	EngineCredential,
	EngineCredentialPayload,
	EngineDidDocument,
	EngineDidResolution,
	EngineDidResolutionOptions,
	EngineFeePaymentOptions,
	EngineIdentifier,
	EngineImportKey,
	EngineKeyInfo,
	EngineKeyType,
	EnginePresentation,
	EnginePresentationPayload,
	EngineResourcePayload,
	EngineSignedInput,
	EngineStatusListOptions,
	EngineStatusOptions,
	EngineStatusResult,
	EngineVerificationOptions,
	EngineVerificationResult,
} from './types.js';

/**
 * Today's engine: a thin wrapper that delegates every call, unchanged, to the existing Veramo-backed
 * `IIdentityService` (Postgres or local provider). No logic lives here. The `as any` casts mark the single
 * place where Veramo's own types meet the engine-neutral ones; the values passed through are identical, so
 * REST responses do not change.
 *
 * Everything Veramo-specific that is not part of the interface (`agent`, `initAgent`, `createAgent`) stays on
 * the wrapped service.
 *
 * The one thing added here: every method that writes to the ledger (and so spends from the customer's payer
 * account) runs inside the per-payer lock, the same queue the Credo engine uses. Reads, key and credential
 * storage and signing do not. With no `payerLock` (tests) calls pass straight through.
 */
export class VeramoEngine implements IdentityEngine {
	readonly name = 'veramo' as const;

	constructor(
		private readonly service: IIdentityService,
		private readonly payerLock?: VeramoPayerLock
	) {}

	private locked<T>(customer: CustomerEntity | undefined, network: string | undefined, work: () => Promise<T>) {
		return this.payerLock ? this.payerLock.run(customer, network, work) : work();
	}

	// Keys
	createKey(type: EngineKeyType | string, customer?: CustomerEntity, keyAlias?: string): Promise<KeyEntity> {
		return this.service.createKey(type as any, customer, keyAlias);
	}
	importKey(
		type: EngineKeyType | string,
		privateKeyHex: string,
		customer?: CustomerEntity,
		keyAlias?: string
	): Promise<KeyEntity> {
		return this.service.importKey(type as any, privateKeyHex, customer, keyAlias);
	}
	getKey(kid: string, customer?: CustomerEntity): Promise<EngineKeyInfo | null> {
		return this.service.getKey(kid, customer) as Promise<any>;
	}

	// DIDs
	createDid(network: string, didDocument: EngineDidDocument, customer: CustomerEntity): Promise<EngineIdentifier> {
		return this.locked(customer, network, () =>
			this.service.createDid(network, didDocument as any, customer)
		) as Promise<any>;
	}
	updateDid(
		didDocument: EngineDidDocument,
		customer: CustomerEntity,
		publicKeyHexs?: string[]
	): Promise<EngineIdentifier> {
		return this.locked(customer, networkOfDid(didDocument?.id), () =>
			this.service.updateDid(didDocument as any, customer, publicKeyHexs)
		) as Promise<any>;
	}
	deactivateDid(did: string, customer: CustomerEntity, publicKeyHexs?: string[]): Promise<boolean> {
		return this.locked(customer, networkOfDid(did), () => this.service.deactivateDid(did, customer, publicKeyHexs));
	}
	importDid(
		did: string,
		keys: EngineImportKey[],
		controllerKeyId: string | undefined,
		customer: CustomerEntity,
		provider?: string
	): Promise<EngineIdentifier & { status?: boolean }> {
		return this.service.importDid(did, keys as any, controllerKeyId, customer, provider) as Promise<any>;
	}
	exportDid(did: string, password: string, customer: CustomerEntity): Promise<ExportDidResponse> {
		return this.service.exportDid(did, password, customer);
	}
	listDids(options: ListDIDRequestOptions, customer: CustomerEntity): Promise<ListDidsResponseBody> {
		return this.service.listDids(options, customer);
	}
	getDid(did: string, customer: CustomerEntity): Promise<unknown> {
		return this.service.getDid(did, customer);
	}
	didExists(did: string, customer: CustomerEntity): Promise<boolean> {
		return this.service.didExists(did, customer);
	}
	resolveDid(did: string, options?: EngineDidResolutionOptions): Promise<EngineDidResolution> {
		return this.service.resolveDid(did, options as any) as Promise<any>;
	}
	resolve(didUrl: string, dereferencing?: boolean): Promise<Response> {
		return this.service.resolve(didUrl, dereferencing);
	}

	// Linked resources
	createResource(
		network: string,
		payload: EngineResourcePayload,
		customer: CustomerEntity,
		publicKeyHexs?: string[]
	): Promise<unknown> {
		return this.locked(customer, network, () =>
			this.service.createResource(network, payload as any, customer, publicKeyHexs)
		);
	}
	listResources(options: ListResourceOptions, customer: CustomerEntity): Promise<ListResourceResponse> {
		return this.service.listResources(options, customer);
	}

	findLatestResourcesVersionsByType(
		resourceType: string,
		customer: CustomerEntity,
		network?: string,
		did?: string,
		page?: number,
		limit?: number
	): Promise<ListResourceResponse> {
		return this.service.findLatestResourcesVersionsByType!(resourceType, customer, network, did, page, limit);
	}

	// Accreditations: the chain walk Studio always ran, no limits added
	verifyAccreditation(
		request: EngineAccreditationVerifyRequest,
		customer: CustomerEntity
	): Promise<EngineAccreditationOutcome> {
		return walkAccreditationChain(veramoAccreditationPorts(this.service, customer), request);
	}

	// Credentials and presentations
	createCredential(
		credential: EngineCredentialPayload,
		format: CredentialRequest['format'],
		statusOptions: EngineStatusOptions | null,
		customer: CustomerEntity
	): Promise<EngineCredential> {
		return this.service.createCredential(credential as any, format, statusOptions as any, customer) as Promise<any>;
	}
	verifyCredential(
		credential: EngineSignedInput,
		verificationOptions: EngineVerificationOptions,
		customer: CustomerEntity
	): Promise<EngineVerificationResult> {
		return this.service.verifyCredential(credential as any, verificationOptions as any, customer) as Promise<any>;
	}
	createPresentation(
		presentation: EnginePresentationPayload,
		verificationOptions: EngineVerificationOptions,
		customer: CustomerEntity
	): Promise<EnginePresentation> {
		return this.service.createPresentation(
			presentation as any,
			verificationOptions as any,
			customer
		) as Promise<any>;
	}
	verifyPresentation(
		presentation: EngineSignedInput,
		verificationOptions: EngineVerificationOptions,
		customer: CustomerEntity
	): Promise<EngineVerificationResult> {
		return this.service.verifyPresentation(
			presentation as any,
			verificationOptions as any,
			customer
		) as Promise<any>;
	}
	listCredentials(options: ListCredentialRequestOptions, customer: CustomerEntity): Promise<ListCredentialResponse> {
		return this.service.listCredentials(options, customer);
	}
	getCredential(credentialId: string, customer: CustomerEntity): Promise<EngineCredential | null> {
		return this.service.getCredential(credentialId, customer) as Promise<any>;
	}
	saveCredential(credential: EngineCredential, customer: CustomerEntity): Promise<string> {
		return this.service.saveCredential(credential as any, customer);
	}
	retrieveCredential(hash: string, customer: CustomerEntity): Promise<EngineCredential | null> {
		return this.service.retrieveCredential(hash, customer) as Promise<any>;
	}
	deleteCredential(hash: string, customer: CustomerEntity): Promise<boolean> {
		return this.service.deleteCredential(hash, customer);
	}

	// Status lists
	createUnencryptedStatusList2021(
		did: string,
		resourceOptions: EngineResourcePayload,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.locked(customer, networkOfDid(did), () =>
			this.service.createUnencryptedStatusList2021(did, resourceOptions as any, statusOptions as any, customer)
		) as Promise<any>;
	}
	createUnencryptedBitstringStatusList(
		did: string,
		resourceOptions: EngineResourcePayload,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.locked(customer, networkOfDid(did), () =>
			this.service.createUnencryptedBitstringStatusList(
				did,
				resourceOptions as any,
				statusOptions as any,
				customer
			)
		) as Promise<any>;
	}
	createEncryptedStatusList2021(
		did: string,
		resourceOptions: EngineResourcePayload,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.locked(customer, networkOfDid(did), () =>
			this.service.createEncryptedStatusList2021(did, resourceOptions as any, statusOptions as any, customer)
		) as Promise<any>;
	}
	createEncryptedBitstringStatusList(
		did: string,
		resourceOptions: EngineResourcePayload,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.locked(customer, networkOfDid(did), () =>
			this.service.createEncryptedBitstringStatusList(did, resourceOptions as any, statusOptions as any, customer)
		) as Promise<any>;
	}
	updateUnencryptedStatusList(
		did: string,
		listType: string,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.locked(customer, networkOfDid(did), () =>
			this.service.updateUnencryptedStatusList(did, listType, statusOptions as any, customer)
		) as Promise<any>;
	}
	updateEncryptedStatusList(
		did: string,
		listType: string,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.locked(customer, networkOfDid(did), () =>
			this.service.updateEncryptedStatusList(did, listType, statusOptions as any, customer)
		) as Promise<any>;
	}
	checkStatusList2021(
		did: string,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.service.checkStatusList2021(did, statusOptions as any, customer) as Promise<any>;
	}
	checkBitstringStatusList(
		did: string,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult | EngineStatusResult[]> {
		return this.service.checkBitstringStatusList(did, statusOptions as any, customer) as Promise<any>;
	}
	searchStatusList(
		did: string,
		statusListName: string,
		listType: string,
		statusPurpose?: 'revocation' | 'suspension',
		customer?: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.service.searchStatusList(did, statusListName, listType, statusPurpose, customer) as Promise<any>;
	}
	broadcastStatusList2021(
		did: string,
		resourceOptions: EngineResourcePayload,
		statusOptions: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<boolean> {
		return this.locked(customer, networkOfDid(did), () =>
			this.service.broadcastStatusList2021(did, resourceOptions as any, statusOptions as any, customer)
		);
	}
	broadcastBitstringStatusList(
		did: string,
		resourceOptions: EngineResourcePayload,
		customer: CustomerEntity
	): Promise<boolean> {
		return this.locked(customer, networkOfDid(did), () =>
			this.service.broadcastBitstringStatusList(did, resourceOptions as any, customer)
		);
	}
	remunerateStatusList2021(
		feePaymentOptions: EngineFeePaymentOptions,
		customer?: CustomerEntity
	): Promise<EngineStatusResult> {
		return this.locked(customer, (feePaymentOptions as any)?.feePaymentNetwork, () =>
			this.service.remunerateStatusList2021(feePaymentOptions as any, customer)
		) as Promise<any>;
	}
	revokeCredentials(
		credential: EngineSignedInput | EngineSignedInput[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<EngineStatusResult> {
		const run = () =>
			this.service.revokeCredentials(
				credential as any,
				listType,
				publish,
				customer,
				symmetricKey
			) as Promise<any>;
		// Only a published change writes to the ledger
		return publish ? this.locked(customer, networkOfCredential(credential), run) : run();
	}
	suspendCredentials(
		credential: EngineSignedInput | EngineSignedInput[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<EngineStatusResult> {
		const run = () =>
			this.service.suspendCredentials(
				credential as any,
				listType,
				publish,
				customer,
				symmetricKey
			) as Promise<any>;
		// Only a published change writes to the ledger
		return publish ? this.locked(customer, networkOfCredential(credential), run) : run();
	}
	reinstateCredentials(
		credential: EngineSignedInput | EngineSignedInput[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<EngineStatusResult> {
		const run = () =>
			this.service.reinstateCredentials(
				credential as any,
				listType,
				publish,
				customer,
				symmetricKey
			) as Promise<any>;
		// Only a published change writes to the ledger
		return publish ? this.locked(customer, networkOfCredential(credential), run) : run();
	}
}
