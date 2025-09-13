import { BeforeInsert, BeforeUpdate, Column, Entity } from 'typeorm';
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
	})
	metadata?: any;

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
		description?: string,
		metadata?: any
	) {
		this.providerId = providerId;
		this.name = name;
		this.providerType = providerType;
		this.supportedFormats = supportedFormats;
		this.supportedProtocols = supportedProtocols;
		this.description = description;
		this.metadata = metadata;
	}
}
