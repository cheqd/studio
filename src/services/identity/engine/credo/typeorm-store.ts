import type { DataSource, FindOptionsRelations, FindOptionsWhere } from 'typeorm';
import { LessThanOrEqual } from 'typeorm';
import type { AbstractPrivateKeyStore } from '@veramo/key-manager';
import { CustomerEntity } from '../../../../database/entities/customer.entity.js';
import { IdentifierEntity } from '../../../../database/entities/identifier.entity.js';
import { KeyEntity } from '../../../../database/entities/key.entity.js';
import { PaymentAccountEntity } from '../../../../database/entities/payment.account.entity.js';
import { ResourceEntity } from '../../../../database/entities/resource.entity.js';
import type { ListDIDRequestOptions, ListDidsResponseBody } from '../../../../types/did.js';
import type { ListResourceOptions, ListResourceResponse } from '../../../../types/resource.js';
import { withAdvisoryLock } from '../../ledger-lock.js';
import type { EngineIdentifier, EngineKeyInfo } from '../types.js';
import { CredoOwnershipError } from './errors.js';
import type { CredoEngineStore, IdentifierRecord, PayerAccount, StoredKey } from './ports.js';

const toStoredKey = (key: KeyEntity): StoredKey => ({
	kid: key.kid,
	type: key.type,
	publicKeyHex: key.publicKeyHex,
	kms: key.kms,
	meta: (key.meta as StoredKey['meta']) ?? null,
	publicKeyAlias: key.publicKeyAlias,
	createdAt: key.createdAt,
});

/**
 * The Credo engine's persistence on Studio's own tables (`customer`, `key`, `identifier`, `resource`,
 * `paymentAccount`) and Veramo's private key table. Every customer-scoped read filters on the customer in the
 * query and decides from `count` or one filtered row, never from the shape of a result.
 */
export class TypeOrmCredoEngineStore implements CredoEngineStore {
	constructor(
		private readonly dataSource: DataSource,
		private readonly privateKeyStore: Pick<AbstractPrivateKeyStore, 'getKey'>
	) {}

	// --- Tenants

	async readTenantId(customerId: string): Promise<string | null> {
		const rows: { credoTenantId: string | null }[] = await this.dataSource.query(
			`SELECT "credoTenantId" FROM "customer" WHERE "customerId" = $1`,
			[customerId]
		);
		if (rows.length === 0) throw new Error('Customer not found');
		return rows[0].credoTenantId ?? null;
	}

	async writeTenantId(customerId: string, tenantId: string): Promise<void> {
		const result = await this.dataSource
			.getRepository(CustomerEntity)
			.createQueryBuilder()
			.update()
			.set({ credoTenantId: tenantId })
			.where(`"customerId" = :customerId AND "credoTenantId" IS NULL`, { customerId })
			.execute();
		if (result.affected !== 1) throw new Error('The customer already has a Credo tenant, or does not exist');
	}

	withTenantCreationLock<T>(customerId: string, work: () => Promise<T>): Promise<T> {
		return withAdvisoryLock(this.dataSource, `credo-tenant:${customerId}`, work);
	}

	async findCustomerIdByTenantId(tenantId: string): Promise<string | null> {
		const rows: { customerId: string }[] = await this.dataSource.query(
			`SELECT "customerId" FROM "customer" WHERE "credoTenantId" = $1`,
			[tenantId]
		);
		return rows.length === 1 ? rows[0].customerId : null;
	}

	// --- Keys

	async findOwnedKey(customerId: string, by: { kid: string } | { publicKeyHex: string }): Promise<StoredKey | null> {
		const key = await this.dataSource
			.getRepository(KeyEntity)
			.findOne({ where: { ...by, customer: { customerId } } as FindOptionsWhere<KeyEntity> });
		return key ? toStoredKey(key) : null;
	}

	async insertOwnedKey(customerId: string, key: StoredKey): Promise<void> {
		const repository = this.dataSource.getRepository(KeyEntity);
		const existing = await repository.findOne({ where: { kid: key.kid }, relations: { customer: true } });
		if (existing) {
			// Never move a key between customers: that would hand one customer another's signing key
			if (existing.customer?.customerId !== customerId) throw new CredoOwnershipError(`Key ${key.kid}`);
			return;
		}
		const entity = new KeyEntity(key.kid, key.type as KeyEntity['type'], key.publicKeyHex);
		entity.kms = key.kms ?? 'postgres';
		entity.meta = (key.meta as KeyEntity['meta']) ?? null;
		entity.customer = { customerId } as CustomerEntity;
		await repository.insert(entity);
	}

	async finaliseOwnedKey(customerId: string, kid: string, alias?: string): Promise<StoredKey | null> {
		const repository = this.dataSource.getRepository(KeyEntity);
		const key = await repository.findOne({ where: { kid, customer: { customerId } } });
		if (!key) return null;
		if (alias) key.publicKeyAlias = alias;
		key.createdAt = new Date();
		return toStoredKey(await repository.save(key));
	}

	// --- DIDs

	async isDidOwned(customerId: string, did: string): Promise<boolean> {
		const count = await this.dataSource
			.getRepository(IdentifierEntity)
			.count({ where: { did, customer: { customerId } } });
		return count > 0;
	}

	async getIdentifier(customerId: string, did: string): Promise<EngineIdentifier | null> {
		const identifier = await this.dataSource.getRepository(IdentifierEntity).findOne({
			where: { did, customer: { customerId } },
			relations: { keys: true, services: true },
		});
		return identifier ? this.toEngineIdentifier(identifier) : null;
	}

	async saveIdentifier(customerId: string, record: IdentifierRecord): Promise<EngineIdentifier> {
		await this.dataSource.transaction(async (manager) => {
			const repository = manager.getRepository(IdentifierEntity);
			const existing = await repository.findOne({ where: { did: record.did }, relations: { customer: true } });
			if (existing && existing.customer?.customerId !== customerId) throw new CredoOwnershipError(record.did);

			const entity = existing ?? new IdentifierEntity();
			entity.did = record.did;
			entity.provider = record.provider;
			entity.controllerKeyId = record.controllerKeyId ?? existing?.controllerKeyId;
			entity.customer = { customerId } as CustomerEntity;
			entity.engine = existing?.engine ?? 'credo';
			await repository.save(entity);

			// Link the signing keys to the identifier, only keys this customer owns
			for (const kid of record.keyIds) {
				await manager.query(`UPDATE "key" SET "identifierDid" = $1 WHERE "kid" = $2 AND "customerId" = $3`, [
					record.did,
					kid,
					customerId,
				]);
			}

			// Replace the service rows with the ones in the current document
			await manager.query(`DELETE FROM "service" WHERE "identifierDid" = $1`, [record.did]);
			for (const service of record.services) {
				const endpoint = service.serviceEndpoint;
				await manager.query(
					`INSERT INTO "service" ("id", "type", "serviceEndpoint", "description", "identifierDid") VALUES ($1, $2, $3, $4, $5)`,
					[
						String(service.id).startsWith('#') ? `${record.did}${service.id}` : String(service.id),
						String(service.type),
						typeof endpoint === 'string' ? endpoint : JSON.stringify(endpoint),
						(service.description as string | undefined) ?? null,
						record.did,
					]
				);
			}
		});
		const saved = await this.getIdentifier(customerId, record.did);
		if (!saved) throw new CredoOwnershipError(record.did);
		return saved;
	}

	async listIdentifiers(customerId: string, options: ListDIDRequestOptions): Promise<ListDidsResponseBody> {
		const where: FindOptionsWhere<IdentifierEntity> = { customer: { customerId } };
		if (options.network) where.provider = `did:cheqd:${options.network}`;
		if (options.createdAt) where.saveDate = LessThanOrEqual(new Date(options.createdAt));

		const withServices = options.metadata === 'true';
		const [entities, total] = await this.dataSource.getRepository(IdentifierEntity).findAndCount({
			where,
			relations: withServices ? { services: true } : undefined,
			skip: options.page && options.limit ? (options.page - 1) * options.limit : 0,
			take: options.limit,
		});

		if (withServices) {
			entities.forEach(
				(entity) =>
					(entity.services = entity.services.map((service) => {
						service.serviceEndpoint =
							typeof service.serviceEndpoint === 'string' && /^[{[]/.test(service.serviceEndpoint.trim())
								? JSON.parse(service.serviceEndpoint)
								: service.serviceEndpoint;
						return service;
					}))
			);
			return { total, dids: entities } as unknown as ListDidsResponseBody;
		}
		return { total, dids: entities.map((entity) => entity.did) };
	}

	private toEngineIdentifier(identifier: IdentifierEntity): EngineIdentifier {
		return {
			did: identifier.did,
			provider: identifier.provider,
			alias: identifier.alias,
			controllerKeyId: identifier.controllerKeyId,
			keys: (identifier.keys ?? []).map((key) => ({
				kid: key.kid,
				kms: key.kms,
				type: key.type,
				publicKeyHex: key.publicKeyHex,
				meta: (key.meta as EngineKeyInfo['meta']) ?? null,
			})),
			services: (identifier.services ?? []).map((service) => ({
				id: service.id,
				type: service.type,
				serviceEndpoint: /^[{[]/.test(service.serviceEndpoint.trim())
					? JSON.parse(service.serviceEndpoint)
					: service.serviceEndpoint,
				...(service.description ? { description: service.description } : {}),
			})) as EngineIdentifier['services'],
		};
	}

	// --- Resources

	async listResources(customerId: string, options: ListResourceOptions): Promise<ListResourceResponse> {
		const filter: Record<string, unknown> = {
			resourceName: options.resourceName,
			resourceType: options.resourceType,
			createdAt: options.createdAt ? LessThanOrEqual(options.createdAt) : undefined,
			customer: { customerId },
			encrypted: options.encrypted,
		};
		if (options.did || options.network) {
			filter.identifier = {
				...(options.did && { did: options.did }),
				...(options.network && { provider: `did:cheqd:${options.network}` }),
			};
		}
		const relations: FindOptionsRelations<ResourceEntity> = { identifier: true };
		const [resources, total] = await this.dataSource.getRepository(ResourceEntity).findAndCount({
			where: filter as FindOptionsWhere<ResourceEntity>,
			relations,
			skip: options.page && options.limit ? (options.page - 1) * options.limit : 0,
			take: options.limit,
		});
		return {
			total,
			resources: resources.map((r) => ({
				resourceId: r.resourceId,
				resourceName: r.resourceName,
				resourceType: r.resourceType,
				mediaType: r.mediaType,
				previousVersionId: r.previousVersionId,
				nextVersionId: r.nextVersionId,
				did: r.identifier.did,
				encrypted: r.encrypted,
			})),
		};
	}

	// --- Payment accounts

	async findPayerAccount(customerId: string, network: string): Promise<PayerAccount | null> {
		const account = await this.dataSource.getRepository(PaymentAccountEntity).findOne({
			where: { customer: { customerId }, namespace: network },
			relations: { key: true },
		});
		return account ? { address: account.address, kid: account.key.kid } : null;
	}

	async readPayerPrivateKeyHex(kid: string): Promise<string | null> {
		try {
			return (await this.privateKeyStore.getKey({ alias: kid }))?.privateKeyHex ?? null;
		} catch {
			// Veramo throws when the alias is unknown
			return null;
		}
	}
}
