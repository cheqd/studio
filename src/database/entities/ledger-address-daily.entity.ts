import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Ledger writes of one faucet-funded address on one UTC day, by operation type and resource type (`''` for DID
 * operations), with the fees paid in ncheq. Replaced per address by the ledger indexer sync, so it is idempotent.
 * Counts and fees only: no DID, resource or transaction identifier is stored.
 */
@Entity('ledgerAddressDaily')
@Index('IDX_ledgerAddressDaily_day', ['day'])
export class LedgerAddressDailyEntity {
	@PrimaryColumn({ type: 'text' })
	address!: string;

	@PrimaryColumn({ type: 'date' })
	day!: string;

	@PrimaryColumn({ type: 'text' })
	operationType!: string;

	@PrimaryColumn({ type: 'text', default: '' })
	resourceType!: string;

	@Column({ type: 'integer', default: 0 })
	count!: number;

	// Exact integer ncheq; returned by the driver as a string
	@Column({ type: 'bigint', default: 0 })
	feeNcheq!: string;
}
