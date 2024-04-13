import type { Repository } from 'typeorm';

import { Connection } from '../../database/connection/connection.js';
import { CoinEntity } from '../../database/entities/coin.entity.js';
import { MINIMAL_DENOM } from '../../types/constants.js';
import { v4 } from 'uuid';

export class CoinService {
	public coinRepository: Repository<CoinEntity>;

	// Get rid of such code and move it to the builder
	public static instance = new CoinService();

	constructor() {
		this.coinRepository = Connection.instance.dbConnection.getRepository(CoinEntity);
	}

	public async create(amount: bigint, denom = MINIMAL_DENOM): Promise<CoinEntity> {
		const coindId = v4();
		const coinEntity = new CoinEntity(coindId, amount, denom);
		const res = await this.coinRepository.insert(coinEntity);
		if (!res) throw new Error(`Cannot create a new coin`);

		return coinEntity;
	}

	public async update(coinId: string, amount?: bigint, denom = MINIMAL_DENOM) {
		const existing = await this.coinRepository.findOneBy({ coinId });
		if (!existing) {
			throw new Error(`logToId not found`);
		}
		if (amount) existing.amount = amount;
		existing.denom = denom;
		return await this.coinRepository.save(existing);
	}

	public async get(coinId?: string): Promise<CoinEntity | null> {
		return await this.coinRepository.findOne({
			where: { coinId },
		});
	}

	public async findOne(where: Record<string, unknown>) {
		return await this.coinRepository.findOne({
			where: where,
		});
	}

	public async isExist(where: Record<string, unknown>) {
		try {
			return (await this.coinRepository.findOne({ where })) ? true : false;
		} catch {
			return false;
		}
	}
}
