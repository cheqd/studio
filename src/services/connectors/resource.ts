import * as dotenv from 'dotenv';
import type { VerifiableCredential } from '@veramo/core';
import { IdentityServiceStrategySetup } from '../identity/index.js';
import type { AlternativeUri, MsgCreateResourcePayload } from '@cheqd/ts-proto/cheqd/resource/v2';
import { v4 } from 'uuid';
import { fromString } from 'uint8arrays';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
dotenv.config();

/**
 * Helper class for the Verida protocol.
 *
 * Run the init method before running any other method.
 */
export class ResourceConnector {
	static instance = new ResourceConnector();

	/**
	 * Send a Verifiable Credential to a DID via the Verida protocol.
	 *
	 * @param recipientDid  The DID of the recipient.
	 * @param messageSubject The subject of the message in which the Credential will be sent to the recipient (similar to an email subject).
	 * @param credential The credential itself.
	 * @param credentialName The name of the credential. For instance, will be displayed in the Verida Wallet UI.
	 * @param credentialSummary A summary of the credential. For instance, will be displayed in the Verida Wallet UI.
	 */
	async sendCredential(
		customer: CustomerEntity,
		recipientDid: string,
		credential: VerifiableCredential,
		credentialName: string,
		resourceType: string,
		resourceVersion: string,
		alsoKnownAs?: AlternativeUri[]
	) {
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(customer.customerId);

		let resourcePayload: Partial<MsgCreateResourcePayload> = {};
		resourcePayload = {
			collectionId: recipientDid.split(':').pop(),
			id: v4(),
			name: credentialName,
			resourceType,
			data: fromString(credential, 'utf-8'),
			version: resourceVersion,
			alsoKnownAs,
		};
		await identityServiceStrategySetup.agent.createResource(recipientDid.split(':')[2], resourcePayload, customer);
	}
}
