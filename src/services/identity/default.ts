import { AbstractIdentity } from ".";
import type { DIDResolutionResult, IVerifyResult, VerifiableCredential, VerifiablePresentation } from "@veramo/core";
import type { CheckStatusListOptions, VerificationOptions } from "../../types/shared";
import type { StatusCheckResult } from "@cheqd/did-provider-cheqd/build/types/agent/ICheqd";
import { Veramo } from "./agent.js";

export class DefaultIdentity extends AbstractIdentity {
	constructor() {
		super();
	  	this.agent = this.initAgent()
	}

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

	searchStatusList2021(did: string, statusListName: string, statusPurpose: 'revocation' | 'suspension', agentId?: string): Promise<any> {
		return Veramo.instance.searchStatusList2021(this.initAgent(), did, statusListName, statusPurpose)
	}
}
