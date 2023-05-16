import type {
	CredentialListRenderType,
	CredentialListType,
	CredentialRenderMapType,
	CredentialTypeType,
} from '$shared/types';

export const safeCredentialList = (
	credentialType: CredentialTypeType,
	credentials?: CredentialRenderMapType
): CredentialListRenderType => {
	const emptyResult = {
		credentials: [] as CredentialListType,
		claimedCount: 0,
		claimPendingCount: 0,
		claimIneligibleCount: 0,
	};

	if (!credentials) {
		return emptyResult;
	}

	return credentials.get(credentialType) ?? emptyResult;
};
