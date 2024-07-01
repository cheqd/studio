/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
	CredentialPayload,
	DIDDocument,
	DIDResolutionResult,
	IIdentifier,
	IKey,
	IVerifyResult,
	ManagedKeyInfo,
	PresentationPayload,
	VerifiableCredential,
	VerifiablePresentation,
	W3CVerifiableCredential,
} from '@veramo/core';
import type {
	ResourcePayload,
	BulkRevocationResult,
	BulkSuspensionResult,
	BulkUnsuspensionResult,
	CreateStatusList2021Result,
	RevocationResult,
	StatusCheckResult,
	SuspensionResult,
	UnsuspensionResult,
	TransactionResult,
} from '@cheqd/did-provider-cheqd';
import type { VeramoAgent } from '../../types/shared';
import type { VerificationOptions } from '../../types/shared';
import type { FeePaymentOptions } from '../../types/credential-status';
import type { CredentialRequest } from '../../types/credential';
import type { CheckStatusListOptions } from '../../types/credential-status';
import type { StatusOptions } from '../../types/credential-status';
import type {
	BroadcastStatusListOptions,
	CreateEncryptedStatusListOptions,
	CreateUnencryptedStatusListOptions,
	UpdateEncryptedStatusListOptions,
	UpdateUnencryptedStatusListOptions,
} from '../../types/credential-status';
import type { IIdentityService } from './index.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { KeyEntity } from '../../database/entities/key.entity.js';
import type { UserEntity } from '../../database/entities/user.entity';
import type { APIKeyEntity } from '../../database/entities/api.key.entity';
import type { SupportedKeyTypes } from '@veramo/utils';

export abstract class AbstractIdentityService implements IIdentityService {
	agent?: VeramoAgent;

	initAgent(): VeramoAgent {
		throw new Error(`Not supported`);
	}

	createKey(type: SupportedKeyTypes, customer?: CustomerEntity, keyAlias?: string): Promise<KeyEntity> {
		throw new Error(`Not supported`);
	}

	importKey(
		type: SupportedKeyTypes,
		privateKeyHex: string,
		customer?: CustomerEntity,
		keyAlias?: string
	): Promise<KeyEntity> {
		throw new Error(`Not supported`);
	}

	createDid(network: string, didDocument: DIDDocument, customer: CustomerEntity): Promise<IIdentifier> {
		throw new Error(`Not supported`);
	}

	updateDid(didDocument: DIDDocument, customer: CustomerEntity, publicKeyHexs?: string[]): Promise<IIdentifier> {
		throw new Error(`Not supported`);
	}

	deactivateDid(did: string, customer: CustomerEntity, publicKeyHexs?: string[]): Promise<boolean> {
		throw new Error(`Not supported`);
	}

	importDid(
		did: string,
		keys: Pick<IKey, 'privateKeyHex' | 'type'>[],
		controllerKeyId: string,
		customer: CustomerEntity
	): Promise<IIdentifier> {
		throw new Error(`Not supported`);
	}

	createResource(
		network: string,
		payload: ResourcePayload,
		customer: CustomerEntity,
		publicKeyHexs?: string[]
	): Promise<any> {
		throw new Error(`Not supported`);
	}

	createCredential(
		credential: CredentialPayload,
		format: CredentialRequest['format'],
		statusOptions: StatusOptions | null,
		customer: CustomerEntity
	): Promise<VerifiableCredential> {
		throw new Error(`Not supported`);
	}
	createUnencryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateUnencryptedStatusListOptions,
		customer: CustomerEntity
	): Promise<CreateStatusList2021Result> {
		throw new Error(`Not supported`);
	}
	createEncryptedStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: CreateEncryptedStatusListOptions,
		customer: CustomerEntity
	): Promise<CreateStatusList2021Result> {
		throw new Error(`Not supported`);
	}
	updateUnencryptedStatusList2021(
		did: string,
		statusOptions: UpdateUnencryptedStatusListOptions,
		customer: CustomerEntity
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult> {
		throw new Error(`Not supported`);
	}
	updateEncryptedStatusList2021(
		did: string,
		statusOptions: UpdateEncryptedStatusListOptions,
		customer: CustomerEntity
	): Promise<BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult> {
		throw new Error(`Not supported`);
	}
	checkStatusList2021(
		did: string,
		statusOptions: CheckStatusListOptions,
		customer: CustomerEntity
	): Promise<StatusCheckResult> {
		throw new Error(`Not supported`);
	}
	searchStatusList2021(
		did: string,
		statusListName: string,
		statusPurpose: 'revocation' | 'suspension',
		customer?: CustomerEntity
	): Promise<any> {
		throw new Error(`Not supported`);
	}
	remunerateStatusList2021(
		feePaymentOptions: FeePaymentOptions,
		customer?: CustomerEntity
	): Promise<TransactionResult> {
		throw new Error(`Not supported`);
	}
	broadcastStatusList2021(
		did: string,
		resourceOptions: ResourcePayload,
		statusOptions: BroadcastStatusListOptions,
		customer: CustomerEntity
	): Promise<boolean> {
		throw new Error(`Not supported`);
	}
	revokeCredentials(
		credential: W3CVerifiableCredential | W3CVerifiableCredential[],
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<RevocationResult | BulkRevocationResult> {
		throw new Error(`Not supported`);
	}
	suspendCredentials(
		credential: W3CVerifiableCredential | W3CVerifiableCredential[],
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<SuspensionResult | BulkSuspensionResult> {
		throw new Error(`Not supported`);
	}
	reinstateCredentials(
		credential: W3CVerifiableCredential | W3CVerifiableCredential[],
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<UnsuspensionResult | BulkUnsuspensionResult> {
		throw new Error(`Not supported`);
	}
	getKey(kid: string, customer: CustomerEntity): Promise<ManagedKeyInfo | null> {
		throw new Error(`Not supported`);
	}
	listDids(customer: CustomerEntity): Promise<string[]> {
		throw new Error(`Not supported`);
	}
	getDid(did: string): Promise<any> {
		throw new Error(`Not supported`);
	}
	resolveDid(did: string): Promise<DIDResolutionResult> {
		throw new Error(`Not supported`);
	}
	resolve(didUrl: string): Promise<Response> {
		throw new Error(`Not supported`);
	}
	createPresentation(
		presentation: PresentationPayload,
		verificationOptions: VerificationOptions,
		customer: CustomerEntity
	): Promise<VerifiablePresentation> {
		throw new Error(`Not supported`);
	}
	verifyCredential(
		credential: VerifiableCredential | string,
		verificationOptions: VerificationOptions,
		customer: CustomerEntity
	): Promise<IVerifyResult> {
		throw new Error(`Not supported`);
	}
	verifyPresentation(
		presentation: VerifiablePresentation | string,
		verificationOptions: VerificationOptions,
		customer: CustomerEntity
	): Promise<IVerifyResult> {
		throw new Error(`Not supported`);
	}
	// ToDo: All the next functions should be removed after adding new API key mechanism
	setAPIKey(apiKey: string, customer: CustomerEntity, user: UserEntity): Promise<APIKeyEntity> {
		throw new Error(`Not supported`);
	}
	updateAPIKey(apiKey: APIKeyEntity, newApiKey: string): Promise<APIKeyEntity> {
		throw new Error(`Not supported`);
	}
	getAPIKey(customer: CustomerEntity, user: UserEntity): Promise<APIKeyEntity | undefined> {
		throw new Error(`Not supported`);
	}
	decryptAPIKey(apiKey: string): Promise<string> {
		throw new Error(`Not supported`);
	}
}
