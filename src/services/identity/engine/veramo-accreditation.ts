/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CustomerEntity } from '../../../database/entities/customer.entity.js';
import type { IIdentityService } from '../index.js';
import { buildCacheKey, getCachedAccreditation, setCachedAccreditation } from './accreditation-cache.js';
import type { AccreditationChainPorts } from './accreditation-chain.js';

/**
 * What the Veramo engine hands the shared chain walk: the same calls `AccreditationService` made on the Veramo
 * identity service, including the 30 second cache of resolved accreditations. Nothing here is new behaviour.
 */
export function veramoAccreditationPorts(service: IIdentityService, customer: CustomerEntity): AccreditationChainPorts {
	return {
		async resolve(accreditationUrl) {
			const cacheKey = buildCacheKey(accreditationUrl, customer?.customerId);
			const cached = getCachedAccreditation(cacheKey);
			if (cached) return cached;
			const res = await service.resolve(accreditationUrl);
			const result = await res.json();
			// Cache successful dereferenced results (skip caching not-found / dereferencing metadata)
			if (!result?.dereferencingMetadata) {
				setCachedAccreditation(cacheKey, result);
			}
			return result;
		},
		async isIssuerDeactivated(credential: any) {
			const did = typeof credential.issuer === 'string' ? credential.issuer : credential.issuer.id;
			const body = await service.resolveDid(did);
			return body.didDocumentMetadata.deactivated || false;
		},
		verifyCredential(credential, options) {
			return service.verifyCredential(credential, options, customer);
		},
	};
}
