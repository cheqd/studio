import type { VerifiableCredential, IVerifyResult, PresentationPayload } from '@veramo/core';
import { Repository, LessThan } from 'typeorm';
import { Connection } from '../../database/connection/connection.js';
import { IssuedCredentialEntity } from '../../database/entities/issued-credential.entity.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { IdentityServiceStrategySetup } from '../identity/index.js';
import { VerificationOptions } from '../../types/shared.js';
import { CheqdW3CVerifiableCredential } from '../w3c-credential.js';
import { Credential } from '@veramo/data-store';
import * as dotenv from 'dotenv';

dotenv.config();

export interface ListOffersOptions {
	holderDid?: string;
	page?: number;
	limit?: number;
}

export interface ListOffersResponse {
	total: number;
	offers: IssuedCredentialEntity[];
	page: number;
	limit: number;
}

export interface AcceptOfferOptions {
	createPresentation?: boolean;
	presentationDomain?: string;
}

export interface AcceptOfferResponse {
	success: boolean;
	credential: VerifiableCredential;
	presentation?: string;
}

export interface RejectOfferResponse {
	success: boolean;
	message: string;
}

export class ReceivedCredentials {
	public static instance = new ReceivedCredentials();
	public repository: Repository<IssuedCredentialEntity>;

	constructor() {
		this.repository = Connection.instance.dbConnection.getRepository(IssuedCredentialEntity);
	}

	/**
	 * List pending credential offers for a holder
	 * @param options - Filter options including optional holderDid
	 * @param customer - Customer entity
	 * @returns List of pending offers
	 */
	async listPendingOffers(options: ListOffersOptions, customer: CustomerEntity): Promise<ListOffersResponse> {
		try {
			const { holderDid, page = 1, limit = 10 } = options;
			let subjectDids: string[] = [];

			// If holderDid not provided, get all DIDs for this customer
			if (!holderDid) {
				subjectDids = await this.getHolderDids(customer);
				if (subjectDids.length === 0) {
					// No DIDs found for customer, return empty result
					return {
						total: 0,
						offers: [],
						page,
						limit,
					};
				}
			} else {
				// Verify the provided holderDid belongs to this customer
				const customerDids = await this.getHolderDids(customer);
				if (!customerDids.includes(holderDid)) {
					throw new Error(`DID ${holderDid} not found in your wallet`);
				}
				subjectDids = [holderDid];
			}

			// Query for offered credentials where subject matches any of the holder's DIDs
			// Note: Don't filter by customer because the issuer could be a different customer
			const queryBuilder = this.repository
				.createQueryBuilder('credential')
				.leftJoinAndSelect('credential.statusRegistry', 'statusRegistry')
				.leftJoinAndSelect('credential.veramoCredential', 'veramoCredential')
				.where('credential.status = :status', { status: 'offered' })
				.andWhere('credential.subjectId IN (:...subjectDids)', { subjectDids })
				.orderBy('credential.createdAt', 'DESC')
				.skip((page - 1) * limit)
				.take(limit);

			const [offers, total] = await queryBuilder.getManyAndCount();

			return {
				total,
				offers,
				page,
				limit,
			};
		} catch (error) {
			throw new Error(`Failed to list pending offers: ${error}`);
		}
	}

	/**
	 * Get details of a specific credential offer
	 * @param issuedCredentialId - ID of the issued credential
	 * @param holderDid - DID of the holder requesting the offer
	 * @param customer - Customer entity
	 * @returns Credential offer details
	 */
	async getOfferDetails(
		issuedCredentialId: string,
		holderDid: string,
		customer: CustomerEntity
	): Promise<IssuedCredentialEntity> {
		try {
			const customerDids = await this.getHolderDids(customer);

			// Check if holderDid is owned by this customer
			if (!customerDids.includes(holderDid)) {
				throw new Error(`DID ${holderDid} not found in your wallet`);
			}

			// Query offer without customer filter (issuer could be different customer)
			const offer = await this.repository.findOne({
				where: {
					issuedCredentialId,
					subjectId: holderDid,
					status: 'offered',
				},
				relations: ['statusRegistry', 'veramoCredential'],
			});

			if (!offer) {
				throw new Error('Credential offer not found or expired');
			}

			// Check if offer has expired
			if (offer.offerExpiresAt && new Date() > offer.offerExpiresAt) {
				throw new Error('Credential offer has expired');
			}

			return offer;
		} catch (error) {
			throw new Error(`Failed to get offer details: ${error}`);
		}
	}

	/**
	 * Accept a credential offer
	 * Verifies the credential, checks subject DID, and updates status
	 * @param issuedCredentialId - ID of the issued credential
	 * @param holderDid - DID of the holder accepting the offer
	 * @param customer - Customer entity
	 * @param options - Additional options for acceptance
	 * @returns Acceptance response with credential and optional presentation
	 */
	async acceptOffer(
		issuedCredentialId: string,
		holderDid: string,
		customer: CustomerEntity,
		options: AcceptOfferOptions = {}
	): Promise<AcceptOfferResponse> {
		try {
			// Get all DIDs for this customer once (to avoid duplicate calls)
			const holderDids = await this.getHolderDids(customer);

			// Check if holderDid is owned by this customer
			if (!holderDids.includes(holderDid)) {
				throw new Error(`DID ${holderDid} not found in your wallet`);
			}

			// Query offer without customer filter (issuer could be different customer)
			const offer = await this.repository.findOne({
				where: {
					issuedCredentialId,
					subjectId: holderDid,
					status: 'offered',
				},
				relations: ['statusRegistry', 'veramoCredential'],
			});

			if (!offer) {
				throw new Error('Credential offer not found or expired');
			}

			// Check if offer has expired
			if (offer.offerExpiresAt && new Date() > offer.offerExpiresAt) {
				throw new Error('Credential offer has expired');
			}

			// Get the credential from the loaded relation
			if (!offer.veramoCredential) {
				throw new Error('Credential not found in dataStore');
			}

			const identityService = new IdentityServiceStrategySetup(customer.customerId);

			// Extract the verifiable credential from Veramo's Credential entity
			const credential = offer.veramoCredential.raw as unknown as VerifiableCredential;

			// Verify the credential
			const verificationOptions: VerificationOptions = {
				verifyStatus: true,
			};
			const verification: IVerifyResult = await identityService.agent.verifyCredential(
				credential,
				verificationOptions,
				customer
			);

			if (!verification.verified) {
				throw new Error(`Invalid credential: ${verification.error}`);
			}

			// Parse credential to get subject
			const parsedCredential = new CheqdW3CVerifiableCredential(credential);
			const credentialSubject = parsedCredential.credentialSubject;

			// Verify subject matches one of holder's DIDs (using cached holderDids)
			const subjectId =
				typeof credentialSubject === 'object' && 'id' in credentialSubject ? credentialSubject.id : null;

			if (!subjectId || !holderDids.includes(subjectId)) {
				throw new Error('Credential subject does not match any of your DIDs');
			}

			// Update the IssuedCredentialEntity
			offer.status = 'issued';
			offer.subjectAcceptedAt = new Date();
			await this.repository.save(offer);

			// Create and publish Verifiable Presentation if requested
			let presentation: string | undefined;
			if (options.createPresentation) {
				presentation = await this.createPresentation(
					credential,
					holderDid,
					customer,
					options.presentationDomain
				);
			}

			return {
				success: true,
				credential,
				presentation,
			};
		} catch (error) {
			throw new Error(`Failed to accept offer: ${error}`);
		}
	}

	/**
	 * Reject a credential offer
	 * Updates status and deletes credential from dataStore
	 * @param issuedCredentialId - ID of the issued credential
	 * @param holderDid - DID of the holder rejecting the offer
	 * @param customer - Customer entity
	 * @returns Rejection response
	 */
	async rejectOffer(
		issuedCredentialId: string,
		holderDid: string,
		customer: CustomerEntity
	): Promise<RejectOfferResponse> {
		try {
			// Get the offer
			const offer = await this.getOfferDetails(issuedCredentialId, holderDid, customer);

			// Update status to rejected
			offer.status = 'rejected';
			await this.repository.save(offer);

			// Delete credential from Veramo dataStore
			if (offer.veramoHash) {
				const identityService = new IdentityServiceStrategySetup(customer.customerId).agent;
				await identityService.deleteCredential(offer.veramoHash, customer);
			}

			return {
				success: true,
				message: 'Credential offer rejected successfully',
			};
		} catch (error) {
			throw new Error(`Failed to reject offer: ${error}`);
		}
	}

	/**
	 * Cleanup expired credential offers
	 * Deletes credentials from dataStore and updates status
	 * This should be run as a cron job
	 * @param customer - Optional customer entity to filter by
	 * @returns Number of offers cleaned up
	 */
	async cleanupExpiredOffers(customer?: CustomerEntity): Promise<number> {
		try {
			const now = new Date();

			// Find expired offers
			const whereCondition: any = {
				status: 'offered',
				offerExpiresAt: LessThan(now),
			};

			if (customer) {
				whereCondition.customer = { customerId: customer.customerId };
			}

			const expiredOffers = await this.repository.find({
				where: whereCondition,
			});

			let cleanedCount = 0;

			for (const offer of expiredOffers) {
				try {
					// Update status to rejected
					offer.status = 'rejected';
					offer.lastError = 'Offer expired';
					await this.repository.save(offer);

					// Delete from dataStore if exists
					if (offer.veramoHash && customer) {
						const identityService = new IdentityServiceStrategySetup(customer.customerId).agent;
						await identityService.deleteCredential(offer.veramoHash, customer);
					}

					cleanedCount++;
				} catch (error) {
					console.error(`Failed to cleanup offer ${offer.issuedCredentialId}:`, error);
				}
			}

			return cleanedCount;
		} catch (error) {
			throw new Error(`Failed to cleanup expired offers: ${error}`);
		}
	}

	/**
	 * Helper: Get all DIDs belonging to the holder/customer
	 * @param customer - Customer entity
	 * @returns Array of DID strings
	 */
	private async getHolderDids(customer: CustomerEntity): Promise<string[]> {
		try {
			const identityService = new IdentityServiceStrategySetup(customer.customerId);
			const agent = identityService.agent;

			if (!agent) {
				throw new Error('Agent not initialized');
			}

			// Get all DIDs for this customer
			const identifiers = await agent.listDids({ page: 1, limit: 1000 }, customer);
			return identifiers.dids.map((d) => (typeof d === 'string' ? d : d.did));
		} catch (error) {
			throw new Error(`Failed to get holder DIDs: ${error}`);
		}
	}

	/**
	 * Helper: Create a verifiable presentation
	 * @param credential - Verifiable credential to include
	 * @param holderDid - DID of the holder
	 * @param customer - Customer entity
	 * @param domain - Optional domain for the presentation
	 * @returns JWT presentation string
	 */
	private async createPresentation(
		credential: VerifiableCredential,
		holderDid: string,
		customer: CustomerEntity,
		domain?: string
	): Promise<string> {
		try {
			const identityService = new IdentityServiceStrategySetup(customer.customerId).agent;

			const presentationPayload: PresentationPayload = {
				holder: holderDid,
				verifiableCredential: [credential],
				'@context': ['https://www.w3.org/2018/credentials/v1'],
				type: ['VerifiablePresentation'],
			};

			const verificationOptions: VerificationOptions = domain ? { domain } : {};

			const presentation = await identityService.createPresentation(
				presentationPayload,
				verificationOptions,
				customer
			);

			// Return as JWT string if available, otherwise stringify
			return typeof presentation === 'string' ? presentation : JSON.stringify(presentation);
		} catch (error) {
			throw new Error(`Failed to create presentation: ${error}`);
		}
	}
	/**
	 * Import an externally issued credential into the dataStore
	 * @param credential - Verifiable credential (JSON object or JWT string)
	 * @param customer - Customer entity
	 * @param holderDid - DID of the holder importing the credential
	 * @returns Imported credential details
	 */
	async importCredential(
		credential: VerifiableCredential | string,
		customer: CustomerEntity,
		holderDid: string
	): Promise<{ success: boolean; credentialHash: string; credential: VerifiableCredential }> {
		try {
			const identityService = new IdentityServiceStrategySetup(customer.customerId).agent;

			// Verify the credential first
			const verificationOptions: VerificationOptions = {
				verifyStatus: false, // Don't verify status for external credentials
			};
			const verification = await identityService.verifyCredential(credential, verificationOptions, customer);

			if (!verification.verified) {
				throw new Error(`Invalid credential: ${verification.error}`);
			}

			// Parse the credential to get details
			const parsedCredential = new CheqdW3CVerifiableCredential(credential);
			const credentialSubject = parsedCredential.credentialSubject;

			// Verify subject matches holder DID
			const subjectId =
				typeof credentialSubject === 'object' && 'id' in credentialSubject ? credentialSubject.id : null;

			if (!subjectId) {
				throw new Error('Credential does not have a valid subject ID');
			}

			// Check if holder DID exists in customer's wallet
			const holderDids = await this.getHolderDids(customer);
			if (!holderDids.includes(holderDid)) {
				throw new Error('Holder DID does not exist in your wallet');
			}

			// Verify subject matches holder DID
			if (subjectId !== holderDid) {
				throw new Error('Credential subject does not match holder DID');
			}

			// Save to Veramo dataStore only
			const credentialHash = await identityService.saveCredential(parsedCredential, customer);

			return {
				success: true,
				credentialHash,
				credential: parsedCredential,
			};
		} catch (error) {
			throw new Error(`Failed to import credential: ${error}`);
		}
	}

	/**
	 * List received credentials (accepted offers + imported credentials)
	 * @param customer - Customer entity
	 * @param holderDid - Optional DID to filter by subject
	 * @returns List of received credentials with their hashes
	 */
	async listReceivedCredentials(
		customer: CustomerEntity,
		holderDid?: string
	): Promise<Array<{ hash: string; credential: VerifiableCredential }>> {
		try {
			// Get all DIDs owned by this customer
			let subjectDids: string[] = [];
			if (!holderDid) {
				subjectDids = await this.getHolderDids(customer);
				if (subjectDids.length === 0) {
					// No DIDs found for customer, return empty result
					return [];
				}
			} else {
				// Verify the provided holderDid belongs to this customer
				const customerDids = await this.getHolderDids(customer);
				if (!customerDids.includes(holderDid)) {
					throw new Error(`DID ${holderDid} not found in your wallet`);
				}
				subjectDids = [holderDid];
			}

			// Use direct TypeORM query on Credential entity to avoid beta dataStoreORM
			// Left join with IssuedCredentialEntity to include both accepted offers and imported credentials
			const credentialRepository = Connection.instance.dbConnection.getRepository(Credential);

			const queryBuilder = credentialRepository
				.createQueryBuilder('credential')
				.leftJoin(IssuedCredentialEntity, 'issued', 'issued.veramoHash = credential.hash')
				.where('credential.subject IN (:...subjectDids)', { subjectDids })
				.andWhere('(issued.status NOT IN (:...excludedStatuses) OR issued.status IS NULL)', {
					excludedStatuses: ['offered', 'rejected'],
				});

			const credentialRecords = await queryBuilder.getMany();

			// Extract and parse the verifiableCredential field from each record along with hash
			const credentials = credentialRecords.map((record) => ({
				hash: record.hash,
				credential: record.raw as unknown as VerifiableCredential,
			}));

			return credentials;
		} catch (error) {
			throw new Error(`Failed to list received credentials: ${error}`);
		}
	}

	/**
	 * Get a specific received credential by hash
	 * @param credentialHash - Hash of the credential
	 * @param customer - Customer entity
	 * @returns Verifiable credential
	 */
	async getReceivedCredential(credentialHash: string, customer: CustomerEntity): Promise<VerifiableCredential> {
		try {
			const identityService = new IdentityServiceStrategySetup(customer.customerId).agent;

			// Use the new retrieveCredential() method instead of beta dataStore method
			const credential = await identityService.retrieveCredential(credentialHash, customer);

			if (!credential) {
				throw new Error(`Credential with hash ${credentialHash} not found`);
			}

			// Verify the credential subject belongs to customer's wallet
			const parsedCredential = new CheqdW3CVerifiableCredential(credential);
			const credentialSubject = parsedCredential.credentialSubject;
			const subjectId =
				typeof credentialSubject === 'object' && 'id' in credentialSubject ? credentialSubject.id : null;

			if (!subjectId) {
				throw new Error('Credential does not have a valid subject ID');
			}

			// Check if subject DID belongs to this customer
			const holderDids = await this.getHolderDids(customer);
			if (!holderDids.includes(subjectId)) {
				throw new Error('Credential subject does not belong to your wallet');
			}

			return credential;
		} catch (error) {
			throw new Error(`Failed to get received credential: ${error}`);
		}
	}
}
