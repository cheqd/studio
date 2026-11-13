import type { CustomerEntity } from '../../../database/entities/customer.entity.js';
import type { IdentityEngine } from './identity-engine.js';

/** What Veramo records in `meta.algorithms` for an Ed25519 key. */
const ED25519_META = { algorithms: ['EdDSA', 'Ed25519'] };

/**
 * Gives a key returned by a non-Veramo engine the exact fields `/key/*` has always returned.
 *
 * The Veramo path returns the `key` row as saved (`customer` on create and import, `publicKeyAlias` and
 * `updatedAt` as null when unset, `meta.algorithms` filled in by Veramo). The Credo engine returns a narrower
 * record. Callers of the REST API must not see which engine answered, so the missing fields are filled in here,
 * for Ed25519 exactly as Veramo writes them. A Veramo key is returned untouched.
 */
export function shapeKeyResponse<T extends object>(key: T, engine: IdentityEngine, customer?: CustomerEntity): T {
	if (engine.name === 'veramo') return key;
	const source = key as Record<string, unknown>;
	const shaped: Record<string, unknown> = { ...source };
	if (shaped.publicKeyAlias === undefined) shaped.publicKeyAlias = null;
	if (shaped.updatedAt === undefined) shaped.updatedAt = null;
	if (shaped.meta === undefined || shaped.meta === null) {
		shaped.meta = shaped.type === 'Ed25519' ? { ...ED25519_META } : null;
	}
	if (customer && shaped.customer === undefined) shaped.customer = customer;
	return shaped as T;
}
