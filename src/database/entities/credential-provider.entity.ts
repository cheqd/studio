import { BeforeInsert, BeforeUpdate, Column, Entity, OneToMany } from 'typeorm';
import { ProviderConfigurationEntity } from './provider-configuration.entity.js';
import * as dotenv from 'dotenv';

dotenv.config();

@Entity('credentialProvider')
export class CredentialProviderEntity {
	@Column({
		type: 'varchar',
		primary: true,
	})
	providerId!: string;

	@Column({
		type: 'varchar',
		nullable: false,
	})
	name!: string;

	@Column({
		type: 'text',
		nullable: true,
	})
	description?: string;

	@Column({
		type: 'varchar',
		nullable: false,
	})
	providerType!: string; // 'credential-all', 'credential-issuance', 'credential-verification', 'etc'

	@Column({
		type: 'json',
		nullable: false,
		default: '[]',
	})
	supportedFormats!: string[];

	@Column({
		type: 'json',
		nullable: false,
		default: '[]',
	})
	supportedProtocols!: string[];

	@Column({
		type: 'json',
		nullable: false,
		default: '[]',
	})
	capabilities!: string[];

	@Column({
		type: 'text',
		nullable: true,
	})
	logoUrl?: string;

	@Column({
		type: 'text',
		nullable: true,
	})
	documentationUrl?: string;

	@Column({
		type: 'text',
		nullable: true,
	})
	apiUrl?: string;

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

	@OneToMany(() => ProviderConfigurationEntity, (config) => config.provider)
	configurations!: ProviderConfigurationEntity[];

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
		name: string,
		providerType: string,
		supportedFormats: string[] = [],
		supportedProtocols: string[] = [],
		capabilities: string[] = [],
		description?: string,
		logoUrl?: string,
		documentationUrl?: string,
		apiUrl?: string
	) {
		this.providerId = providerId;
		this.name = name;
		this.providerType = providerType;
		this.supportedFormats = supportedFormats;
		this.supportedProtocols = supportedProtocols;
		this.capabilities = capabilities;
		this.description = description;
		this.logoUrl = logoUrl;
		this.documentationUrl = documentationUrl;
		this.apiUrl = apiUrl;
	}
}
