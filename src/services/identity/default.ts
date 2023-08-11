import { AbstractIdentity } from "./IIdentity.js";
import { DIDResolutionResult, IVerifyResult, VerifiableCredential, VerifiablePresentation } from "@veramo/core";
import { CheckStatusListOptions, VerificationOptions } from "../../types/types";
import { StatusCheckResult } from "@cheqd/did-provider-cheqd/build/types/agent/ICheqd";
import { Veramo } from "./agent.js";
import { fetchResponseBody } from "../../helpers/helpers.js";

export class DefaultIdentity extends AbstractIdentity {
    async resolveDid(did: string, agentId?: string): Promise<DIDResolutionResult> {
		return Veramo.instance.resolveDid(this.initAgent(), did)
	}

	async resolve(didUrl: string): Promise<[string, string]> {
		return Veramo.instance.resolve(didUrl)
	}

	async resourceList(did: string): Promise<any> {
		return (await fetch(`${process.env.RESOLVER_URL}/${did}/metadata`)).json()
	}
	async getResource(did: string, resourceId: string): Promise<[string, string]> {
		return fetchResponseBody(`${process.env.RESOLVER_URL}/${did}/resources/${resourceId}`)
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
