import type { CredentialPayload, VerifiableCredential } from '@veramo/core';

import { VC_CONTEXT, VC_TYPE } from '../../types/constants.js';
import type { CredentialRequest } from '../../types/credential.js';
import { IdentityServiceStrategySetup } from '../identity/index.js';
import { v4 } from 'uuid';
import * as dotenv from 'dotenv';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { VeridaDIDValidator } from '../../controllers/validator/did.js';
dotenv.config();

const { ENABLE_VERIDA_CONNECTOR } = process.env;

export class Credentials {
	public static instance = new Credentials();

	async issue_credential(request: CredentialRequest, customer: CustomerEntity): Promise<VerifiableCredential> {
		const {
			attributes,
			credentialName,
			credentialSummary,
			credentialSchema,
			issuerDid,
			subjectDid,
			type,
			expirationDate,
			credentialStatus,
			'@context': context,
			format,
			...additionalData
		} = request;

		const credential: CredentialPayload = {
			'@context': [...(context || []), ...VC_CONTEXT],
			type: [...(type || []), VC_TYPE],
			issuer: { id: issuerDid },
			credentialSchema,
			credentialSubject: {
				id: subjectDid,
				...attributes,
			},
			issuanceDate: new Date().toISOString(),
			...additionalData,
		};

		if (expirationDate) {
			credential.expirationDate = expirationDate;
		}

		const statusOptions = credentialStatus || null;

		const verifiable_credential = await new IdentityServiceStrategySetup(
			customer.customerId
		).agent.createCredential(credential, format, statusOptions, customer);

		const isVeridaDid = new VeridaDIDValidator().validate(subjectDid);
		if (ENABLE_VERIDA_CONNECTOR === 'true' && isVeridaDid.valid && isVeridaDid.namespace) {
			if (!credentialSchema) throw new Error('Credential schema is required');

			// dynamic import to avoid circular dependency
			const { VeridaService } = await import('../connectors/verida.js');

			await VeridaService.instance.sendCredential(
				isVeridaDid.namespace,
				subjectDid,
				'New Verifiable Credential',
				verifiable_credential,
				credentialName || v4(),
				credentialSchema,
				credentialSummary
			);
		}
		return verifiable_credential;
	}
}
