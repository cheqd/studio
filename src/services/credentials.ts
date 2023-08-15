import type { CredentialPayload, VerifiableCredential } from '@veramo/core';

import { VC_CONTEXT, VC_TYPE } from '../types/constants.js';
import type { CredentialRequest } from '../types/shared.js';
import { Identity } from './identity/index.js';
import { VeridaService } from '../services/connectors/verida.js';
import { v4 } from 'uuid';
import * as dotenv from 'dotenv';
dotenv.config();

const { ENABLE_VERIDA_CONNECTOR } = process.env;

export class Credentials {
	public static instance = new Credentials();

	async issue_credential(request: CredentialRequest, agentId: string): Promise<VerifiableCredential> {
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

		const verifiable_credential = await new Identity(agentId).agent.createCredential(
			credential,
			request.format,
			statusOptions,
			agentId
		);

		if (ENABLE_VERIDA_CONNECTOR === 'true' && request.subjectDid.startsWith('did:vda')) {
			if (!request.credentialSchema) throw new Error('Credential schema is required');
			await VeridaService.instance.sendCredential(
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
