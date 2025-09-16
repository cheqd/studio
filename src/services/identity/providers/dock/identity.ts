import { CredentialPayload, IIdentifier, VerifiableCredential } from '@veramo/core';
import { DIDDocument } from 'did-resolver';
import { CustomerEntity } from '../../../../database/entities/customer.entity';
import { AbstractIdentityService } from '../../abstract';
import { ListDIDRequestOptions, ListDidsResponseBody } from '../../../../types/did';
import {
	DockCreateDidResponse,
	DockExportDidResponse,
	DockIssueCredentialRequestBody,
	DockListDidsResponse,
} from './types';
import { CredentialRequest } from '../../../../types/credential';
import { StatusOptions } from '../../../../types/credential-status';
import { ProviderService } from '../../../api/providers/provider.service';
import { IdentityServiceStrategySetup } from '../..';
import { decryptPrivateKey } from '../../../../helpers/helpers';
import { fromString, toString } from 'uint8arrays';

export class DockIdentityService extends AbstractIdentityService {
	supportedProvider = 'dock';

	defaultApiUrl = 'https://api-testnet.truvera.io';

	async createDid(network: string, didDocument: DIDDocument, customer: CustomerEntity): Promise<IIdentifier> {
		// TODO: add soft delete in provider
		const provider = await ProviderService.instance.getProvider(this.supportedProvider!);
		if (!provider) {
			throw new Error(`Provider ${this.supportedProvider} not found`);
		}

		// TODO: fetch api key using customer
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

		if (!response.ok) {
			throw new Error(`Failed to create did with ${this.supportedProvider}: ${response.statusText}`);
		}

		const data = (await response.json()) as DockCreateDidResponse;
		// save in db
		const exportedDid = await this.exportDid(data.data.did, customer);
		if (exportedDid) {
			const identityStrategySetup = new IdentityServiceStrategySetup(customer.customerId);
			const { iv, recipients, tag } = exportedDid.credentialSubject.encryptedWalletContents;
			const encryptedKey = recipients[0].encrypted_key;
			const key = decryptPrivateKey(encryptedKey, iv, tag);
			await identityStrategySetup.agent.importDid(
				exportedDid.id,
				[{ privateKeyHex: toString(fromString(key), 'hex'), type: 'Ed25519' }],
				undefined,
				customer
			);
		}
		return {
			did: data.data.did,
			provider: this.supportedProvider,
			controllerKeyId: data.data.controller,
		} as IIdentifier;
	}

	async listDids(options: ListDIDRequestOptions, customer: CustomerEntity): Promise<ListDidsResponseBody> {
		const provider = await ProviderService.instance.getProvider(this.supportedProvider!);
		if (!provider) {
			throw new Error(`Provider ${this.supportedProvider} not found`);
		}

		// TODO: fetch api key using customer
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
		const provider = await ProviderService.instance.getProvider(this.supportedProvider!);
		if (!provider) {
			throw new Error(`Provider ${this.supportedProvider} not found`);
		}

		// TODO: fetch api key using customer
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
				persist: true,
				format,
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

		if (!response.ok) {
			throw new Error(`Failed to create credential with ${this.supportedProvider}: ${response.statusText}`);
		}

		const vc = (await response.json()) as VerifiableCredential;

		return vc;
	}

	async listCredentials(customer: CustomerEntity): Promise<VerifiableCredential[]> {
		throw new Error(`Not supported`);
	}

	async exportDid(did: string, customer: CustomerEntity): Promise<DockExportDidResponse> {
		const provider = await ProviderService.instance.getProvider(this.supportedProvider!);
		if (!provider) {
			throw new Error(`Provider ${this.supportedProvider} not found`);
		}

		// TODO: fetch api key using customer
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
				type: 'cheqd',
				keytype: 'ed25519',
			}),
		});
		if (!response.ok) {
			throw new Error(`Failed to create did with ${this.supportedProvider}: ${response.statusText}`);
		}

		return (await response.json()) as DockExportDidResponse;
	}
}
