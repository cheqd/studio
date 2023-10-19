import type { Repository } from 'typeorm';

import { Connection } from '../database/connection/connection.js';

import * as dotenv from 'dotenv';
import { RoleEntity } from '../database/entities/role.entity.js';
dotenv.config();

export class RoleService {
	public roleRepository: Repository<RoleEntity>;

	// Get rid of such code and move it to the builder
	public static instance = new RoleService();

	constructor() {
		this.roleRepository = Connection.instance.dbConnection.getRepository(RoleEntity);
	}

	public async create(roleTypeId: string, name: string, logToRoleIds: string[]) {
		if (await this.isExist({ roleTypeId: roleTypeId })) {
			throw new Error(`Cannot create a new role since the role with same roleTypeId ${roleTypeId} already exists`);
		}
        const roleEntity = new RoleEntity(roleTypeId, name, logToRoleIds);
        const res = await this.roleRepository.insert(roleEntity);
        if (!res) throw new Error(`Cannot create a new role`);
        return roleEntity;
	}

	public async update(
        roleTypeId: string,
		name?: string,
		logToRoleIds?: string[],
	) {
		const existing = await this.roleRepository.findOneBy({ roleTypeId });
		if (!existing) {
			throw new Error(`Role with given roleTypeId ${roleTypeId} not found`);
		}
        if (name) existing.name = name;
        if (logToRoleIds) existing.logToRoleIds = logToRoleIds;
		return await this.roleRepository.save(existing);
	}

	public async get(roleTypeId: string): Promise<RoleEntity | null> {
		return await this.roleRepository.findOne(
            {
                where: { roleTypeId },
            });
	}

	public async findOne(where: Record<string, unknown>) {
		return await this.roleRepository.findOneBy(where);
	}

	public async isExist(
		where: Record<string, unknown>) {
		try {
			return (await this.roleRepository.findOne({ where })) ? true : false;
		} catch {
			return false;
		}
	}
}
