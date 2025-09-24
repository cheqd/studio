import { CredentialPayload, IIdentifier, IKey, VerifiableCredential } from '@veramo/core';
import { DIDDocument } from 'did-resolver';
import { CustomerEntity } from '../../../../database/entities/customer.entity.js';
import { AbstractIdentityService } from '../../abstract.js';
import { ExportDidResponse, ListDIDRequestOptions, ListDidsResponseBody } from '../../../../types/did.js';
import {
	DockCreateDidResponse,
	DockDecryptedCredentialContent,
	DockDecryptedKey,
	DockIssueCredentialRequestBody,
	DockListCredentialRequestOptions,
	DockListCredentialResponse,
	DockListDidsResponse,
} from './types.js';
import { CredentialRequest, ListCredentialResponse } from '../../../../types/credential.js';
import { StatusOptions } from '../../../../types/credential-status.js';
import { ProviderService } from '../../../api/provider.service.js';
import { fromString, toString } from 'uint8arrays';
import { contentsFromEncryptedWalletCredential, passwordToKeypair } from '@docknetwork/universal-wallet';
import { IdentityServiceStrategySetup } from '../../index.js';

export class DockIdentityService extends AbstractIdentityService {
	supportedProvider = 'dock';

	defaultApiUrl = 'https://api-testnet.truvera.io';

	async createDid(network: string, didDocument: DIDDocument, customer: CustomerEntity): Promise<IIdentifier> {
		const provider = await ProviderService.instance.getProvider(this.supportedProvider!, { deprecated: false });
		if (!provider) {
			throw new Error(`Provider ${this.supportedProvider} not found or deprecated`);
		}

		const providerConfig = await ProviderService.instance.getProviderConfiguration(
			customer.customerId,
			provider?.providerId
		);
		if (!providerConfig) {
			throw new Error(`Provider ${this.supportedProvider} not configured for customer ${customer.customerId}`);
		}
		const apiKey = await ProviderService.instance.getDecryptedApiKey(providerConfig);
		const response = await fetch(`${this.defaultApiUrl}/dids`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				type: 'cheqd',
				keytype: 'ed25519',
			}),
		});
		const data = (await response.json()) as DockCreateDidResponse;
		if (response.status != 200) {
			throw new Error(`Failed to create did with ${this.supportedProvider}: ${response.statusText}`);
		}
		// save in db
		// Add a time delay before exporting
		await new Promise((resolve) => setTimeout(resolve, 5000));
		const exportedDid = await this.exportDid(data.data.did, '', customer);
		if (exportedDid) {
			const identityStrategySetup = new IdentityServiceStrategySetup(customer.customerId);
			const kp = await passwordToKeypair(process.env.PROVIDER_EXPORT_PASSWORD);
			const decyptedContent = (await contentsFromEncryptedWalletCredential(
				exportedDid,
				kp
			)) as DockDecryptedCredentialContent[];
			const keys = decyptedContent
				.filter((c) => typeof c.type === 'string' && (c as DockDecryptedKey).privateKeyBase58)
				.map((c) => ({
					type: 'Ed25519' as any,
					privateKeyHex: toString(fromString((c as DockDecryptedKey).privateKeyBase58, 'base58btc'), 'hex'),
				}));

			const didDocument = (decyptedContent.find((c) => (c as any).didDocument) as any)
				?.didDocument as DIDDocument;

			const vm = didDocument.verificationMethod![0];
			const pkBase58 = vm.publicKeyBase58;
			const controllerKeyId = toString(fromString(pkBase58, 'base58btc'), 'hex');

			return await identityStrategySetup.agent.importDid(
				didDocument.id,
				keys,
				controllerKeyId,
				customer,
				`did:cheqd:${network || 'testnet'}`
			);
		}
		return {
			did: data.data.did,
			provider: this.supportedProvider,
			controllerKeyId: data.data.controller,
		} as IIdentifier;
	}

    async getDid(did: string, customer: CustomerEntity): Promise<any> {
        const provider = await ProviderService.instance.getProvider(this.supportedProvider!, { deprecated: false });
		if (!provider) {
			throw new Error(`Provider ${this.supportedProvider} not found or deprecated`);
		}

		const providerConfig = await ProviderService.instance.getProviderConfiguration(
			customer.customerId,
			provider?.providerId
		);
		if (!providerConfig) {
			throw new Error(`Provider ${this.supportedProvider} not configured for customer ${customer.customerId}`);
		}
		const apiKey = await ProviderService.instance.getDecryptedApiKey(providerConfig);

		const response = await fetch(`${this.defaultApiUrl}/dids`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch DIDs with ${this.supportedProvider}: ${response.statusText}`);
		}

		const data = (await response.json()) as DockListDidsResponse;

		return {
			dids: data.map((item) => item.did),
			total: data.length,
		} as ListDidsResponseBody;
    }

	async listDids(options: ListDIDRequestOptions, customer: CustomerEntity): Promise<ListDidsResponseBody> {
		const provider = await ProviderService.instance.getProvider(this.supportedProvider!, { deprecated: false });
		if (!provider) {
			throw new Error(`Provider ${this.supportedProvider} not found or deprecated`);
		}

		const providerConfig = await ProviderService.instance.getProviderConfiguration(
			customer.customerId,
			provider?.providerId
		);
		if (!providerConfig) {
			throw new Error(`Provider ${this.supportedProvider} not configured for customer ${customer.customerId}`);
		}
		const apiKey = await ProviderService.instance.getDecryptedApiKey(providerConfig);

		const response = await fetch(`${this.defaultApiUrl}/dids`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch DIDs with ${this.supportedProvider}: ${response.statusText}`);
		}

		const data = (await response.json()) as DockListDidsResponse;

		return {
			dids: data.map((item) => item.did),
			total: data.length,
		} as ListDidsResponseBody;
	}

	async createCredential(
		credential: CredentialPayload,
		format: CredentialRequest['format'],
		statusOptions: StatusOptions | null,
		customer: CustomerEntity
	): Promise<VerifiableCredential> {
		const provider = await ProviderService.instance.getProvider(this.supportedProvider!, { deprecated: false });
		if (!provider) {
			throw new Error(`Provider ${this.supportedProvider} not found or deprecated`);
		}

		const providerConfig = await ProviderService.instance.getProviderConfiguration(
			customer.customerId,
			provider?.providerId
		);
		if (!providerConfig) {
			throw new Error(`Provider ${this.supportedProvider} not configured for customer ${customer.customerId}`);
		}
		const apiKey = await ProviderService.instance.getDecryptedApiKey(providerConfig);
		const { issuer, subject, issuanceDate, expirationDate, ...payload } = credential;
		const response = await fetch(`${this.defaultApiUrl}/credentials`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				persist: false,
				format,
				distribute: true,
				credential: {
					...payload,
					issuer: typeof credential.issuer === 'string' ? credential.issuer : credential.issuer.id,
					subject: credential.credentialSubject!,
					issuanceDate: issuanceDate?.toLocaleString() || new Date().toISOString(),
					expirationDate: expirationDate?.toLocaleString() || undefined,
					status: statusOptions || undefined,
				},
			} satisfies DockIssueCredentialRequestBody),
		});

		if (response.status != 200) {
			throw new Error(`Failed to create credential with ${this.supportedProvider}: ${response.statusText}`);
		}

		const jwt = await response.json();
		// Decode JWT to VerifiableCredential
		const [, payloadBase64] = jwt.split('.');
		const credentialJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
		const vc: VerifiableCredential = JSON.parse(credentialJson);
		return vc;
	}

	async exportDid(did: string, _password: string, customer: CustomerEntity): Promise<ExportDidResponse> {
		if (!process.env.PROVIDER_EXPORT_PASSWORD) {
			throw new Error('Provider export requires a password');
		}

		const provider = await ProviderService.instance.getProvider(this.supportedProvider!, { deprecated: false });
		if (!provider) {
			throw new Error(`Provider ${this.supportedProvider} not found or deprecated`);
		}

		const providerConfig = await ProviderService.instance.getProviderConfiguration(
			customer.customerId,
			provider?.providerId
		);
		if (!providerConfig) {
			throw new Error(`Provider ${this.supportedProvider} not configured for customer ${customer.customerId}`);
		}

		const apiKey = await ProviderService.instance.getDecryptedApiKey(providerConfig);
		const response = await fetch(`${this.defaultApiUrl}/dids/${did}/export`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				password: process.env.PROVIDER_EXPORT_PASSWORD,
			}),
		});
		const result = await response.json();
		if (!response.ok) {
			throw new Error(`Failed to create did with ${this.supportedProvider}: ${response.statusText}`);
		}

		const [didDocument, ...keys] = result;

		return {
			...didDocument,
			keys,
		};
	}

	async listCredentials(
		options: DockListCredentialRequestOptions,
		customer: CustomerEntity
	): Promise<ListCredentialResponse> {
		const provider = await ProviderService.instance.getProvider(this.supportedProvider!, { deprecated: false });
		if (!provider) {
			throw new Error(`Provider ${this.supportedProvider} not found or deprecated`);
		}

		const providerConfig = await ProviderService.instance.getProviderConfiguration(
			customer.customerId,
			provider?.providerId
		);
		if (!providerConfig) {
			throw new Error(`Provider ${this.supportedProvider} not configured for customer ${customer.customerId}`);
		}
		const apiKey = await ProviderService.instance.getDecryptedApiKey(providerConfig);

		const response = await fetch(`${this.defaultApiUrl}/credentials`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch DIDs with ${this.supportedProvider}: ${response.statusText}`);
		}

		const data = (await response.json()) as DockListCredentialResponse;
		return {
			credentials: data.map((credential) => ({
				status: credential.revoked ? 'revoked' : 'issued',
				providerId: provider.providerId,
				id: credential.id,
				issuerDid: credential.issuerKey.split('#')[0],
				subjectDid: credential.subjectRef,
				type: credential.type,
				format: 'jwt',
				createdAt: credential.createdAt,
				expirationDate: credential.expirationDate,
				credentialStatus: credential.revocationRegistry
					? {
							id: credential.revocationRegistry,
							index: credential.index,
						}
					: undefined,
			})),
			total: data.length,
		};
	}

	async importDid(
		did: string,
		keys: Pick<IKey, 'privateKeyHex' | 'type'>[],
		controllerKeyId: string,
		customer: CustomerEntity
	): Promise<IIdentifier & { status: boolean }> {
		if (!process.env.PROVIDER_EXPORT_PASSWORD) {
			throw new Error('Provider export requires a password');
		}

		const provider = await ProviderService.instance.getProvider(this.supportedProvider!, { deprecated: false });
		if (!provider) {
			throw new Error(`Provider ${this.supportedProvider} not found or deprecated`);
		}

		const providerConfig = await ProviderService.instance.getProviderConfiguration(
			customer.customerId,
			provider?.providerId
		);
		if (!providerConfig) {
			throw new Error(`Provider ${this.supportedProvider} not configured for customer ${customer.customerId}`);
		}

		const identityStrategySetup = new IdentityServiceStrategySetup(customer.customerId);
		const exportedDid = await identityStrategySetup.agent.exportDid(did, '', customer);
		const apiKey = await ProviderService.instance.getDecryptedApiKey(providerConfig);
		const response = await fetch(`${this.defaultApiUrl}/dids/${did}/import`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},

			body: JSON.stringify(exportedDid),
		});
		const result = await response.json();
		if (response.status != 200) {
			throw new Error(`Failed to create did with ${this.supportedProvider}: ${JSON.stringify(result)}`);
		}

		return {
			status: true,
			did,
			provider: 'dock',
			keys: [],
			services: [],
		};
	}

	async importDidV2(
		did: string,
		exportedDidResult: ExportDidResponse,
		_password: string,
		customer: CustomerEntity
	): Promise<IIdentifier & { status: boolean }> {
		if (!process.env.PROVIDER_EXPORT_PASSWORD) {
			throw new Error('Provider export requires a password');
		}

		// Step 1: Resolve provider
		const provider = await ProviderService.instance.getProvider(this.supportedProvider!, {
			deprecated: false,
		});
		if (!provider) {
			throw new Error(`Provider ${this.supportedProvider} not found or deprecated`);
		}

		const providerConfig = await ProviderService.instance.getProviderConfiguration(
			customer.customerId,
			provider.providerId
		);
		if (!providerConfig) {
			throw new Error(`Provider ${this.supportedProvider} not configured for customer ${customer.customerId}`);
		}

		// Step 2: Send export result to provider
		const apiKey = await ProviderService.instance.getDecryptedApiKey(providerConfig);

		const { keys, ...exportResult } = exportedDidResult;
		const response = await fetch(`${this.defaultApiUrl}/dids/import`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({ data: [exportResult, ...keys] }),
		});

		const result = await response.json();
		if (response.status !== 200) {
			throw new Error(`Failed to import DID with ${this.supportedProvider}: ${JSON.stringify(result)}`);
		}

		// Step 3: Return identifier
		return {
			status: true,
			did,
			provider: this.supportedProvider!,
			keys: [], // optionally map exportedDidResult -> keys[]
			services: [],
		};
	}
}
