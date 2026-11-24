import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { CustomerEntity } from './customer.entity.js';

/**
 * When each customer first reached each activation milestone (cheqd/studio#869). One row per customer, written by
 * `recordActivation`, which only ever fills an empty column. Cascades with the customer.
 */
@Entity('customerActivation')
export class CustomerActivationEntity {
	@PrimaryColumn({ type: 'uuid' })
	customerId!: string;

	@OneToOne(() => CustomerEntity, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId', foreignKeyConstraintName: 'FK_customerActivation_customerId' })
	customer?: CustomerEntity;

	@Column({ type: 'timestamptz', nullable: true })
	firstDidCreatedAt?: Date;

	@Column({ type: 'timestamptz', nullable: true })
	firstCredentialIssuedAt?: Date;

	@Column({ type: 'timestamptz', nullable: true })
	firstAgentRegisteredAt?: Date;

	@Column({ type: 'timestamptz', nullable: true })
	firstStatusListCreatedAt?: Date;

	/** First API key the customer created itself (`POST /admin/api-key/create`), not a session key (U-35). */
	@Column({ type: 'timestamptz', nullable: true })
	firstApiKeyCreatedAt?: Date;

	/** First faucet request that credited the account (U-35). */
	@Column({ type: 'timestamptz', nullable: true })
	firstFaucetRequestAt?: Date;

	/** First tracked operation of any kind (U-35). */
	@Column({ type: 'timestamptz', nullable: true })
	firstApiCallAt?: Date;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt!: Date;
}
