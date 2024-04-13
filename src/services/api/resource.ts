import type { Repository } from 'typeorm';

import { Connection } from '../../database/connection/connection.js';

import * as dotenv from 'dotenv';
import { ResourceEntity } from '../../database/entities/resource.entity.js';
import type { IdentifierEntity } from '../../database/entities/identifier.entity.js';
import type { KeyEntity } from '../../database/entities/key.entity.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { LinkedResourceMetadataResolutionResult } from '@cheqd/did-provider-cheqd';
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
		symmetricKey?: string
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

	public async get(resourceId: string) {
		return await this.resourceRepository.findOne({
			where: { resourceId },
			relations: ['customer', 'key', 'identifier'],
		});
	}

	public async find(where: Record<string, unknown>) {
		return await this.resourceRepository.find({
			where: where,
			relations: ['customer', 'key', 'identifier'],
		});
	}

	public async createFromLinkedResource(
		resource: LinkedResourceMetadataResolutionResult,
		customer: CustomerEntity,
		key: KeyEntity,
		identifier: IdentifierEntity,
		encrypted: boolean,
		symmetricKey: string
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
