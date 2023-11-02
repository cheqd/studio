import type { Repository } from 'typeorm';

import { Connection } from '../database/connection/connection.js';
import type { CustomerEntity } from '../database/entities/customer.entity.js';

import * as dotenv from 'dotenv';
import { UserEntity } from '../database/entities/user.entity.js';
import type { RoleEntity } from '../database/entities/role.entity.js';
dotenv.config();

export class UserService {
	public userRepository: Repository<UserEntity>;

	// Get rid of such code and move it to the builder
	public static instance = new UserService();

	constructor() {
		this.userRepository = Connection.instance.dbConnection.getRepository(UserEntity);
	}

	public async create(logToId: string, customer: CustomerEntity, role: RoleEntity): Promise<UserEntity> {
		if (await this.isExist({ logToId: logToId })) {
			throw new Error(`Cannot create a new user since the user with same logToId ${logToId} already exists`);
		}
        const userEntity = new UserEntity(logToId, customer, role);
        const res = await this.userRepository.insert(userEntity);
        if (!res) throw new Error(`Cannot create a new user`);
        return userEntity;
	}

	public async update(
        logToId: string,
		customer?: CustomerEntity,
		role?: RoleEntity,
	) {
		const existing = await this.userRepository.findOneBy({ logToId });
		if (!existing) {
			throw new Error(`logToId not found`);
		}
        if (customer) existing.customer = customer;
        if (role) existing.role = role;
		return await this.userRepository.save(existing);
	}

	public async get(logToId?: string): Promise<UserEntity | null> {
		return await this.userRepository.findOne(
            {
                where: { logToId },
                relations: ['customer', 'role']
            })
	}

	public async findOne(where: Record<string, unknown>) {
		return await this.userRepository.findOne(
            {
                where: where, 
                relations: ['customer', 'role']
            })
	}

	public async isExist(
		where: Record<string, unknown>) {
		try {
			return (await this.userRepository.findOne({ where })) ? true : false;
		} catch {
			return false;
		}
	}
}
