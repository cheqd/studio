import type { CredentialPayload, VerifiableCredential } from '@veramo/core';
import { VC_CONTEXT, VC_TYPE } from '../../types/constants.js';
import { CredentialConnectors, type CredentialRequest } from '../../types/credential.js';
import { IdentityServiceStrategySetup } from '../identity/index.js';
import { v4 } from 'uuid';
import * as dotenv from 'dotenv';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { VeridaDIDValidator } from '../../controllers/validator/did.js';
import { ResourceConnector } from '../connectors/resource.js';
import { DockIdentityService } from '../identity/providers/index.js';
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
			connector,
			credentialId,
			...additionalData
		} = request;

		const credential: CredentialPayload = {
			'@context': [...(context || []), ...VC_CONTEXT],
			type: [...new Set([...(type || []), VC_TYPE])],
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

		// Handle credential issuance and connector logic
		switch (connector) {
			case CredentialConnectors.Dock:
				const dock = new DockIdentityService();
				// validate issuerDid in provider
				const existingIssuer = await dock.getDid(issuerDid, customer).catch(() => undefined);
				if (!existingIssuer) {
					// export from wallet
					const exportResult = await new IdentityServiceStrategySetup(customer.customerId).agent.exportDid(
						issuerDid,
						process.env.PROVIDER_EXPORT_PASSWORD || '',
						customer
					);
					// import into provider
					await dock.importDidV2(issuerDid, exportResult, process.env.PROVIDER_EXPORT_PASSWORD, customer);
				}
				return await dock.createCredential(credential, format, statusOptions, customer);
			case CredentialConnectors.Resource:
			case CredentialConnectors.Studio:
			case CredentialConnectors.Verida:
			default:
				const verifiable_credential = await new IdentityServiceStrategySetup(
					customer.customerId
				).agent.createCredential(credential, format, statusOptions, customer);

				const isVeridaDid = new VeridaDIDValidator().validate(subjectDid);
				if (
					ENABLE_VERIDA_CONNECTOR === 'true' &&
					connector === CredentialConnectors.Verida &&
					isVeridaDid.valid &&
					isVeridaDid.namespace
				) {
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
				} else if (connector && connector === CredentialConnectors.Resource) {
					await ResourceConnector.instance.sendCredential(
						customer,
						issuerDid,
						verifiable_credential,
						credentialName || v4(),
						type ? type[0] : 'VerifiableCredential',
						v4(),
						undefined,
						credentialId
					);
				}
				return verifiable_credential;
		}
	}
}
