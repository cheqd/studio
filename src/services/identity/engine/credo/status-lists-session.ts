import {
	DidRepository,
	JwsService,
	TypedArrayEncoder,
	getKmsKeyIdForVerifiacationMethod,
	getPublicJwkFromVerificationMethod,
} from '@credo-ts/core';
import type { StatusListSession } from './status-list-types.js';

/** The pieces of a Credo tenant agent the status-list session uses. */
interface TenantAgentLike {
	context: never;
	dependencyManager: { resolve<T>(token: unknown): T };
	// biome-ignore lint/suspicious/noExplicitAny: the Credo API objects are generic over the module set
	modules: any;
}

/** Signing for status lists inside one customer's tenant. Ledger writes stay with the engine, under the payer lock. */
export function createStatusListSession(tenantAgent: TenantAgentLike): StatusListSession {
	const context = tenantAgent.context as never;
	return {
		async signBitstringProof({ did, signerDidUrl, purposes, ttl, issuanceDate, expirationDate }) {
			const record = await tenantAgent.dependencyManager
				.resolve<DidRepository>(DidRepository)
				.findCreatedDid(context, did);
			if (!record?.didDocument) throw new Error(`${did} is not a DID created or imported by this tenant`);
			const method = record.didDocument.dereferenceKey(signerDidUrl, ['assertionMethod', 'authentication']);
			const publicJwk = getPublicJwkFromVerificationMethod(method);
			const keyId = getKmsKeyIdForVerifiacationMethod(method, record.keys) ?? publicJwk.legacyKeyId;
			const nbf = Math.floor(new Date(issuanceDate).getTime() / 1000);
			return tenantAgent.dependencyManager.resolve<JwsService>(JwsService).createJwsCompact(context, {
				keyId,
				payload: TypedArrayEncoder.fromUtf8String(
					JSON.stringify({
						vc: {
							'@context': ['https://www.w3.org/2018/credentials/v1'],
							type: ['VerifiableCredential', 'BitstringStatusListCredential'],
							credentialSubject: {
								type: 'BitstringStatusList',
								statusPurpose: purposes,
								...(ttl !== undefined ? { ttl } : {}),
							},
						},
						nbf,
						...(expirationDate ? { exp: Math.floor(new Date(expirationDate).getTime() / 1000) } : {}),
						iss: did,
					})
				),
				protectedHeaderOptions: { alg: publicJwk.signatureAlgorithm, typ: 'JWT', kid: signerDidUrl },
			});
		},

		async createTokenStatusList({ didUrl, alg, uri, bits, size, ttlSeconds }) {
			const result = await tenantAgent.modules.tokenStatusList.createTokenStatusList({
				format: 'jwt',
				statusList: { statusListLength: size, bitsPerStatus: bits },
				statusListUri: uri,
				signer: { method: 'did', didUrl },
				alg,
				timeToLive: ttlSeconds,
			});
			return result.statusList as string;
		},

		async updateTokenStatusList({ didUrl, alg, token, updates }) {
			const result = await tenantAgent.modules.tokenStatusList.updateTokenStatusList({
				format: 'jwt',
				token,
				status: updates,
				signer: { method: 'did', didUrl },
				alg,
			});
			return result.statusList as string;
		},
	};
}
