import { AbstractIdentity } from "./IIdentity.js";
import { DIDResolutionResult, IVerifyResult, VerifiableCredential, VerifiablePresentation } from "@veramo/core";
import { CheckStatusListOptions, VerificationOptions } from "../../types/types";
import { StatusCheckResult } from "@cheqd/did-provider-cheqd/build/types/agent/ICheqd";
import { Veramo } from "./agent.js";

export class DefaultIdentity extends AbstractIdentity {
    async resolveDid(didUrl: string): Promise<DIDResolutionResult> {
		return (await fetch(`${process.env.RESOLVER_URL}/${didUrl}`)).json()
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

async function fetchResponseBody(url: string): Promise<[string, string]> {
	const response = await fetch(url)
	const body = await response.arrayBuffer()
	return [response.headers.get("content-type")!, new TextDecoder().decode(body)]
}
