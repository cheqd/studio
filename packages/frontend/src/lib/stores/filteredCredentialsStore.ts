import { derived, writable } from 'svelte/store';

import type {
	CredentialListType,
	CredentialFilterType,
	CredentialTypeListType,
	IssuerConfigResponse,
	CredentialTypeType,
} from '$shared/types';
import { CredentialClaimStatusSchema, CredentialFilterSchema } from '$shared/schema';

type FilterBy = {
	filterType: CredentialFilterType;
	credentialType: CredentialTypeListType;
	issuer: string[];
};

type CachedCredentials = {
	allCredentials: CredentialListType | null;
};

export const filterByStore = writable<FilterBy>({
	filterType: CredentialFilterSchema.enum.ALL,
	credentialType: [],
	issuer: [],
});

export const loadingFilters = writable(false);
export const filterByCredentialType = writable<CredentialTypeListType>([]);

export const cachedCredentialsStore = writable<CachedCredentials>({
	allCredentials: null,
});
const tenantIdToDidStore = writable<Record<string, string | undefined | null>>({});

export const issuerIdStore = writable<string[]>([]);

export const filteredCredentials = derived(
	[filterByStore, cachedCredentialsStore, issuerIdStore, tenantIdToDidStore],
	async ([$filterByStore, $cachedCredentialsStore, $issuerIdStore, $tenantIdToDidStore]) => {
		if (
			$filterByStore.filterType === CredentialFilterSchema.enum.ALL &&
			$filterByStore.credentialType.length === 0 &&
			$filterByStore.issuer.length === 0
		) {
			return [];
		}
		loadingFilters.set(true);
		let filteredCredentials: CredentialListType = [];

		// filter by claim status
		switch ($filterByStore.filterType) {
			case CredentialFilterSchema.enum.CLAIM_PENDING: {
				if ($cachedCredentialsStore.allCredentials) {
					filteredCredentials = $cachedCredentialsStore.allCredentials?.filter(
						(cred) => cred.appMeta.status === CredentialClaimStatusSchema.enum.CLAIM_PENDING
					);
				} else {
					filteredCredentials = [];
				}
				break;
			}
			case CredentialFilterSchema.enum.CLAIMED: {
				if ($cachedCredentialsStore.allCredentials) {
					filteredCredentials = $cachedCredentialsStore.allCredentials?.filter(
						(cred) => cred.appMeta.status === CredentialClaimStatusSchema.enum.CLAIMED
					);
				} else {
					filteredCredentials = [];
				}
				break;
			}

			case CredentialFilterSchema.enum.INELIGIBLE: {
				// NOTE: we dont have ineligible credentials filter on UI
				break;
			}

			case CredentialFilterSchema.enum.ALL: {
				if ($cachedCredentialsStore.allCredentials) {
					filteredCredentials = $cachedCredentialsStore.allCredentials;
				} else {
					filteredCredentials = [];
				}
				break;
			}
		}
		// Filter based on types selected
		filteredCredentials = filteredCredentials.filter((cred) => {
			// if filter is only by claimstatus
			if ($filterByStore.credentialType.length === 0) {
				return true;
			}
			return $filterByStore.credentialType.includes(cred.appMeta.category as CredentialTypeType);
		});

		// on first load - populate tenantIdToDidStore
		if (Object.keys($tenantIdToDidStore).length === 0) {
			$issuerIdStore.forEach(async (issuerId) => {
				const response = await fetch(
					`/api/waltid/issuer/configuration/${issuerId}` // default is waltid
				);
				if (response.status === 200) {
					const issuerConfig = (await response.json()) as IssuerConfigResponse;

					tenantIdToDidStore.update((prev) => {
						return {
							...prev,
							[issuerId]: issuerConfig.issuers.issuerDid,
						};
					});
				}
			});
		}

		// Filter based on issuers selected
		filteredCredentials = filteredCredentials.filter((cred) => {
			// if no filter by issuer
			if ($filterByStore.issuer.length === 0) {
				return true;
			}

			// map issuer ids, then filter by ids
			return $filterByStore.issuer.map((e) => $tenantIdToDidStore[e]).includes(cred.credential?.issuer);
		});

		loadingFilters.set(false);
		return filteredCredentials;
	}
);
