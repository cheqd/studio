import { IdentityServiceStrategySetup } from "./identity";
import type { CheqdW3CVerifiableCredential } from "./w3c_credential";
import type { CheqdW3CVerifiablePresentation } from "./w3c_presentation";


export async function isCredentialIssuerDidDeactivated(credential: CheqdW3CVerifiableCredential): Promise<boolean> {
	const identityServiceStrategySetup = new IdentityServiceStrategySetup();

	const resolutionResult = await identityServiceStrategySetup.agent.resolve(credential.issuer);
	const body = await resolutionResult.json();

	return body.didDocumentMetadata.deactivated;
}

export async function isIssuerDidDeactivated(presentation: CheqdW3CVerifiablePresentation): Promise<boolean> {
	const credentials = presentation.verifiableCredential || [];
	for (const credential of credentials) {
		const result = await isCredentialIssuerDidDeactivated(credential);
		if (result) {
			return true;
		}
	}
	return false;
}