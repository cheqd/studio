import { DIDResolutionResult } from "did-resolver";
import { AbstractIdentity } from "./IIdentity.js";
import { IVerifyResult, VerifiableCredential, VerifiablePresentation } from "@veramo/core";
import { CheckStatusListOptions, VerificationOptions } from "../../types/types";
import { StatusCheckResult } from "@cheqd/did-provider-cheqd/build/types/agent/ICheqd";
import { Veramo } from "./agent.js";

export class DefaultIdentity extends AbstractIdentity {
    async resolveDid(didUrl: string): Promise<DIDResolutionResult> {
		const res = await fetch(`${process.env.RESOLVER_URL}/${didUrl}`)
		return res.json()
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
