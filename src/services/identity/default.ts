/* eslint-disable @typescript-eslint/no-unused-vars */
import type { DIDResolutionResult } from "did-resolver";
import { AbstractIdentityService } from "./abstract.js";
import type { IVerifyResult, VerifiableCredential, VerifiablePresentation } from "@veramo/core";
import type { CheckStatusListOptions, FeePaymentOptions, SearchStatusListResult, VerificationOptions } from "../../types/shared";
import type { StatusCheckResult, TransactionResult } from "@cheqd/did-provider-cheqd";
import { Veramo } from "./agent.js";

export class DefaultIdentityService extends AbstractIdentityService {
    async resolveDid(did: string, agentId?: string): Promise<DIDResolutionResult> {
		return Veramo.instance.resolveDid(this.initAgent(), did)
	}

	async resolve(didUrl: string): Promise<Response> {
		return Veramo.instance.resolve(didUrl)
	}

	verifyCredential(credential: VerifiableCredential | string, verificationOptions: VerificationOptions, agentId?: string): Promise<IVerifyResult> {
		return Veramo.instance.verifyCredential(this.initAgent(), credential, verificationOptions)
	}

	verifyPresentation(presentation: VerifiablePresentation | string, verificationOptions: VerificationOptions, agentId?: string): Promise<IVerifyResult> {
		return Veramo.instance.verifyPresentation(this.initAgent(), presentation, verificationOptions)
	}

	checkStatusList2021(did: string, statusOptions: CheckStatusListOptions, agentId?: string): Promise<StatusCheckResult> {
		return Veramo.instance.checkStatusList2021(this.initAgent(), did, statusOptions)
	}

	searchStatusList2021(did: string, statusListName: string, statusPurpose: 'revocation' | 'suspension', agentId?: string): Promise<SearchStatusListResult> {
		return Veramo.instance.searchStatusList2021(did, statusListName, statusPurpose)
	}

	remunerateStatusList2021(feePaymentOptions: FeePaymentOptions, agentId?: string): Promise<TransactionResult> {
		return Veramo.instance.remunerateStatusList2021(this.initAgent(), feePaymentOptions)
	}
}
