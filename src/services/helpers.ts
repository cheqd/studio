import type { TPublicKeyEd25519 } from '@cheqd/did-provider-cheqd';
import type { CustomerEntity } from '../database/entities/customer.entity.js';
import type { IBooleanResponse } from '../types/shared.js';
import { IdentityServiceStrategySetup } from './identity/index.js';
import { KeyService } from './api/key.js';
import type { CheqdW3CVerifiableCredential } from './w3c-credential.js';
import type { CheqdW3CVerifiablePresentation } from './w3c-presentation.js';

export async function isCredentialIssuerDidDeactivated(credential: CheqdW3CVerifiableCredential): Promise<boolean> {
	const identityServiceStrategySetup = new IdentityServiceStrategySetup();
    const did = typeof credential.issuer === 'string' ? credential.issuer : credential.issuer.id;
	const resolutionResult = await identityServiceStrategySetup.agent.resolve(did);
	const body = await resolutionResult.json();

	return body.didDocumentMetadata.deactivated;
}

export async function isIssuerDidDeactivated(presentation: CheqdW3CVerifiablePresentation): Promise<boolean> {
	const credentials = presentation.verifiableCredential || [];
	for (const credential of credentials) {
		const result = await isCredentialIssuerDidDeactivated(credential);
		if (result) {
			return true;
		}
	}
	return false;
}

export async function arePublicKeyHexsInWallet(
	publicKeyHexs: string[],
	customer: CustomerEntity
): Promise<IBooleanResponse> {
	const ownedKeys = await KeyService.instance.find({ customer: customer });
	if (ownedKeys.length === 0) {
		return {
			status: false,
			error: `Customer has no keys in wallet`,
		} satisfies IBooleanResponse;
	}
	const ownedPublicKeysHexs = ownedKeys.map((key) => key.publicKeyHex);
	const notOwnedPublicKeysHexs = publicKeyHexs.filter((key) => !ownedPublicKeysHexs.includes(key));
	if (notOwnedPublicKeysHexs.length > 0) {
		return {
			status: false,
			error: `Public keys with hexs: ${notOwnedPublicKeysHexs.join(', ')} are not owned by the customer`,
		} satisfies IBooleanResponse;
	}
	return { status: true } satisfies IBooleanResponse;
}

export function toTPublicKeyEd25519(publicKeyHex: string): TPublicKeyEd25519 {
	return {
		type: 'Ed25519',
		publicKeyHex: publicKeyHex,
		kid: publicKeyHex,
	} satisfies TPublicKeyEd25519;
}
