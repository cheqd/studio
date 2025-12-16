import type { FindOptionsRelations, FindOptionsWhere, Repository } from 'typeorm';
import { In } from 'typeorm';
import type { IdentifierEntity } from '../../database/entities/identifier.entity.js';
import type { KeyEntity } from '../../database/entities/key.entity.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { LinkedResourceMetadataResolutionResult } from '@cheqd/did-provider-cheqd';

import { Connection } from '../../database/connection/connection.js';
import { ResourceEntity } from '../../database/entities/resource.entity.js';

import * as dotenv from 'dotenv';

dotenv.config();

export class ResourceService {
	public resourceRepository: Repository<ResourceEntity>;

	public static instance = new ResourceService();

	constructor() {
		this.resourceRepository = Connection.instance.dbConnection.getRepository(ResourceEntity);
	}

	public async create(
		resourceId: string,
		resourceName: string,
		resourceType: string,
		mediaType: string,
		previousVersionId: string,
		nextVersionId: string,
		customer: CustomerEntity,
		identifier: IdentifierEntity,
		key: KeyEntity,
		encrypted: boolean,
		symmetricKey: string
	): Promise<ResourceEntity> {
		const resourceEntity = new ResourceEntity(
			resourceId,
			resourceName,
			resourceType,
			mediaType,
			previousVersionId,
			nextVersionId,
			customer,
			identifier,
			key,
			encrypted,
			symmetricKey
		);
		const resource = (await this.resourceRepository.insert(resourceEntity)).identifiers[0];
		if (!resource) throw new Error(`Cannot create a new resource`);
		return resourceEntity;
	}

	public async update(
		resourceId: string,
		identifier?: IdentifierEntity,
		key?: KeyEntity,
		resourceName?: string,
		resourceType?: string,
		mediaType?: string,
		previousVersionId?: string,
		nextVersionId?: string,
		customer?: CustomerEntity,
		encrypted?: boolean,
		symmetricKey?: string,
		namespace?: string
	) {
		const existingResource = await this.resourceRepository.findOneBy({ resourceId });
		if (!existingResource) {
			throw new Error(`Resource with id: ${resourceId} not found`);
		}
		if (identifier) existingResource.identifier = identifier;
		if (key) existingResource.key = key;
		if (resourceName) existingResource.resourceName = resourceName;
		if (resourceType) existingResource.resourceType = resourceType;
		if (mediaType) existingResource.mediaType = mediaType;
		if (previousVersionId) existingResource.previousVersionId = previousVersionId;
		if (nextVersionId) existingResource.nextVersionId = nextVersionId;
		if (customer) existingResource.customer = customer;
		if (encrypted) existingResource.encrypted = encrypted;
		if (symmetricKey) existingResource.symmetricKey = symmetricKey;
		return await this.resourceRepository.save(existingResource);
	}

	public async get(resourceId: string, relations?: FindOptionsRelations<ResourceEntity>) {
		return await this.resourceRepository.findOne({
			where: { resourceId },
			relations,
		});
	}

	public async find(
		where: FindOptionsWhere<ResourceEntity> | FindOptionsWhere<ResourceEntity>[],
		page?: number,
		limit?: number,
		relations?: FindOptionsRelations<ResourceEntity>
	) {
		return await this.resourceRepository.findAndCount({
			where,
			relations,
			skip: page && limit ? (page - 1) * limit : 0,
			take: limit,
		});
	}

	public async findLatestVersionsByType(
		resourceType: string,
		customer: CustomerEntity,
		network?: string,
		did?: string,
		page?: number,
		limit?: number,
		relations?: FindOptionsRelations<ResourceEntity>
	): Promise<{ resources: ResourceEntity[]; total: number }> {
		const baseQuery = this.resourceRepository
			.createQueryBuilder('r')
			.select([
				'r."resourceId" AS "resourceId"',
				'ROW_NUMBER() OVER (PARTITION BY r."identifierDid", r."resourceName", r."resourceType" ORDER BY COALESCE(r."updatedAt", r."createdAt") DESC, r."createdAt" DESC, r."resourceId" DESC) AS rn',
				'COALESCE(r."updatedAt", r."createdAt") AS "sortTimestamp"',
				'r."createdAt" AS "createdAt"',
			])
			.where('r."customerId" = :customerId', { customerId: customer.customerId })
			.andWhere('r."resourceType" = :resourceType', { resourceType })
			.andWhere('r."nextVersionId" IS NULL');

		if (did) {
			baseQuery.andWhere('r."identifierDid" = :did', { did });
		}

		if (network) {
			baseQuery.andWhere('r."identifierDid" LIKE :networkPattern', { networkPattern: `%did:cheqd:${network}:%` });
		}

		const ranked = this.resourceRepository
			.createQueryBuilder('ranked')
			.select([
				'ranked."resourceId" AS "resourceId"',
				'ranked."sortTimestamp" AS "sortTimestamp"',
				'ranked."createdAt" AS "createdAt"',
			])
			.from(() => baseQuery, 'ranked')
			.where('ranked.rn = 1')
			.orderBy('ranked."sortTimestamp"', 'DESC')
			.addOrderBy('ranked."createdAt"', 'DESC');

		const totalResult = await this.resourceRepository
			.createQueryBuilder('ranked')
			.select('COUNT(1)', 'count')
			.from(() => baseQuery, 'ranked')
			.where('ranked.rn = 1')
			.getRawOne<{ count: string }>();

		const pageNumber = Number(page);
		const limitNumber = Number(limit);
		if (Number.isFinite(pageNumber) && Number.isFinite(limitNumber) && pageNumber > 0 && limitNumber > 0) {
			ranked.offset((pageNumber - 1) * limitNumber).limit(limitNumber);
		}

		const latestRows = await ranked.getRawMany<{ resourceId: string }>();
		const resourceIds = latestRows.map((row) => row.resourceId);
		if (resourceIds.length === 0) {
			return { resources: [], total: Number(totalResult?.count || 0) };
		}

		const resources = await this.resourceRepository.find({
			where: { resourceId: In(resourceIds) },
			relations,
		});

		// preserve ordering from ranked query
		const order = new Map(resourceIds.map((id, index) => [id, index]));
		return {
			resources: resources.sort((a, b) => (order.get(a.resourceId) ?? 0) - (order.get(b.resourceId) ?? 0)),
			total: Number(totalResult?.count || 0),
		};
	}

	public async createFromLinkedResource(
		resource: LinkedResourceMetadataResolutionResult,
		customer: CustomerEntity,
		key: KeyEntity,
		identifier: IdentifierEntity,
		encrypted: boolean,
		symmetricKey: string,
		namespace: string
	) {
		const resourceEntity = new ResourceEntity(
			resource.resourceId,
			resource.resourceName,
			resource.resourceType,
			resource.mediaType,
			resource.previousVersionId,
			resource.nextVersionId,
			customer,
			identifier,
			key,
			encrypted,
			symmetricKey
		);
		const result = (await this.resourceRepository.insert(resourceEntity)).identifiers[0];
		if (!result) throw new Error(`Cannot create a new resource`);
		return resourceEntity;
	}
}
