// src/database/entities/provider-configuration.entity.ts
import { BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CustomerEntity } from './customer.entity.js';
import { CredentialProviderEntity } from './credential-provider.entity.js';
import * as dotenv from 'dotenv';

dotenv.config();

@Entity('providerConfiguration')
export class ProviderConfigurationEntity {
	@PrimaryGeneratedColumn('uuid')
	configId!: string;

	@Column({
		type: 'varchar',
		nullable: false,
	})
	providerId!: string;

	@Column({
		type: 'text',
		nullable: false,
	})
	encryptedApiKey!: string;

	@Column({
		type: 'text',
		nullable: false,
	})
	apiEndpoint!: string;

	@Column({
		type: 'text',
		nullable: true,
	})
	webhookUrl?: string;

	@Column({
		type: 'boolean',
		default: false,
	})
	validated!: boolean;

	@Column({
		type: 'timestamptz',
		nullable: true,
	})
	validatedAt?: Date;

	@Column({
		type: 'boolean',
		default: false,
	})
	active!: boolean;

	@Column({
		type: 'json',
		nullable: true,
	})
	defaultSettings?: any;

	@Column({
		type: 'timestamptz',
		nullable: false,
	})
	createdAt!: Date;

	@Column({
		type: 'timestamptz',
		nullable: true,
	})
	updatedAt?: Date;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer!: CustomerEntity;

	@ManyToOne(() => CredentialProviderEntity, (provider) => provider.providerId, { nullable: false })
	@JoinColumn({ name: 'providerId' })
	provider!: CredentialProviderEntity;

	@BeforeInsert()
	setCreatedAt() {
		this.createdAt = new Date();
	}

	@BeforeUpdate()
	setUpdateAt() {
		this.updatedAt = new Date();
	}

	constructor(
		providerId: string,
		encryptedApiKey: string,
		apiEndpoint: string,
		customer: CustomerEntity,
		provider: CredentialProviderEntity,
		webhookUrl?: string,
		defaultSettings?: any
	) {
		this.providerId = providerId;
		this.encryptedApiKey = encryptedApiKey;
		this.apiEndpoint = apiEndpoint;
		this.customer = customer;
		this.provider = provider;
		this.webhookUrl = webhookUrl;
		this.defaultSettings = defaultSettings;
	}
}
