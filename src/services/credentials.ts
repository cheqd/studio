import type { CredentialPayload, VerifiableCredential } from '@veramo/core';

import { VC_CONTEXT, VC_TYPE } from '../types/constants.js';
import type { CredentialRequest } from '../types/credential.js';
import { IdentityServiceStrategySetup } from './identity/index.js';
import { v4 } from 'uuid';
import * as dotenv from 'dotenv';
import type { CustomerEntity } from '../database/entities/customer.entity.js';
import { VeridaDIDValidator } from '../controllers/validator/did.js';
dotenv.config();

const { ENABLE_VERIDA_CONNECTOR } = process.env;

export class Credentials {
	public static instance = new Credentials();

	async issue_credential(request: CredentialRequest, customer: CustomerEntity): Promise<VerifiableCredential> {
		const credential: CredentialPayload = {
			'@context': [...(request['@context'] || []), ...VC_CONTEXT],
			type: [...(request.type || []), VC_TYPE],
			issuer: { id: request.issuerDid },
			credentialSchema: request.credentialSchema,
			credentialSubject: {
				id: request.subjectDid,
				...request.attributes,
			},
			issuanceDate: new Date().toISOString(),
		};

		if (request.expirationDate) {
			credential.expirationDate = request.expirationDate;
		}

		const statusOptions = request.credentialStatus || null;

		const verifiable_credential = await new IdentityServiceStrategySetup(
			customer.customerId
		).agent.createCredential(credential, request.format, statusOptions, customer);

		const isVeridaDid = new VeridaDIDValidator().validate(request.subjectDid);
		if (ENABLE_VERIDA_CONNECTOR === 'true' && isVeridaDid.valid) {
			if (!request.credentialSchema) throw new Error('Credential schema is required');

			// dynamic import to avoid circular dependency
			const { VeridaService } = await import('./connectors/verida.js');

			await VeridaService.instance.sendCredential(
				isVeridaDid.namespace,
				request.subjectDid,
				'New Verifiable Credential',
				verifiable_credential,
				request.credentialName || v4(),
				request.credentialSchema,
				request.credentialSummary
			);
		}
		return verifiable_credential;
	}
}
