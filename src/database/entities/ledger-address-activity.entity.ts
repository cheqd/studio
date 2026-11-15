import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * What the ledger indexer last learned about one faucet-funded testnet address: when it first and last wrote to the
 * cheqd DID and resource modules, how many writes, and of what kind. One row per address, replaced on each check, so
 * the sync is idempotent. An address with no row has not been checked yet (that is "no data", never "no writes").
 * Counts only: no DID, resource or transaction identifier is stored.
 */
@Entity('ledgerAddressActivity')
export class LedgerAddressActivityEntity {
	@PrimaryColumn({ type: 'text' })
	address!: string;

	@Column({ type: 'timestamptz', nullable: true })
	firstWriteAt?: Date | null;

	@Column({ type: 'timestamptz', nullable: true })
	lastWriteAt?: Date | null;

	@Column({ type: 'integer', default: 0 })
	writeCount!: number;

	@Column({ type: 'integer', default: 0 })
	didWriteCount!: number;

	@Column({ type: 'integer', default: 0 })
	statusListWriteCount!: number;

	@Column({ type: 'integer', default: 0 })
	otherResourceWriteCount!: number;

	// The address had more writes than one sync reads, so the per-kind counts are a lower bound
	@Column({ type: 'boolean', default: false })
	capped!: boolean;

	@Column({ type: 'timestamptz' })
	checkedAt!: Date;
}
