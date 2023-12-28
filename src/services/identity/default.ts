/* eslint-disable @typescript-eslint/no-unused-vars */
import type { DIDResolutionResult } from 'did-resolver';
import { AbstractIdentityService } from './abstract.js';
import type { IVerifyResult, VerifiableCredential, VerifiablePresentation } from '@veramo/core';
import type { VerificationOptions } from '../../types/credential.js';
import type { FeePaymentOptions } from '../../types/credential-status.js';
import type { CheckStatusListOptions } from '../../types/credential-status.js';
import type { SearchStatusListResult } from '../../types/credential-status.js';
import type { StatusCheckResult, TransactionResult } from '@cheqd/did-provider-cheqd';
import { Veramo } from './agent.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';

export class DefaultIdentityService extends AbstractIdentityService {
	async resolveDid(did: string): Promise<DIDResolutionResult> {
		return Veramo.instance.resolveDid(this.initAgent(), did);
	}

	async resolve(didUrl: string): Promise<Response> {
		return Veramo.instance.resolve(didUrl);
	}

	verifyCredential(
		credential: VerifiableCredential | string,
		verificationOptions: VerificationOptions,
		customer: CustomerEntity
	): Promise<IVerifyResult> {
		return Veramo.instance.verifyCredential(this.initAgent(), credential, verificationOptions);
	}

	verifyPresentation(
		presentation: VerifiablePresentation | string,
		verificationOptions: VerificationOptions,
		customer: CustomerEntity
	): Promise<IVerifyResult> {
		return Veramo.instance.verifyPresentation(this.initAgent(), presentation, verificationOptions);
	}

	checkStatusList2021(
		did: string,
		statusOptions: CheckStatusListOptions,
		customer: CustomerEntity
	): Promise<StatusCheckResult> {
		return Veramo.instance.checkStatusList2021(this.initAgent(), did, statusOptions);
	}

	searchStatusList2021(
		did: string,
		statusListName: string,
		statusPurpose: 'revocation' | 'suspension',
		customer: CustomerEntity
	): Promise<SearchStatusListResult> {
		return Veramo.instance.searchStatusList2021(did, statusListName, statusPurpose);
	}

	remunerateStatusList2021(
		feePaymentOptions: FeePaymentOptions,
		customer: CustomerEntity
	): Promise<TransactionResult> {
		return Veramo.instance.remunerateStatusList2021(this.initAgent(), feePaymentOptions);
	}
}
