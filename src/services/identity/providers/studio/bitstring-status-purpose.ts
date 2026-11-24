import { AsyncLocalStorage } from 'node:async_hooks';
import { Cheqd } from '@cheqd/did-provider-cheqd';

/**
 * Work-around for single-purpose Bitstring status lists on the Veramo engine.
 *
 * A Bitstring status list credential may carry `credentialSubject.statusPurpose` as a single string
 * (`"message"`) or as an array (`["refresh", "message"]`). `did-provider-cheqd`'s
 * `IssueCredentialWithBitstringStatusList` checks the requested purpose with
 * `Object.values(statusPurpose).includes(purpose)`, which only works for arrays: for a string it compares
 * against the individual letters and fails with "statusPurpose must be one of m, e, s, s, a, g, e".
 *
 * The plugin fetches the list itself through the static `Cheqd.fetchBitstringStatusList`, so the only place
 * Studio can intervene without patching the library is that fetch. Other plugin paths verify the list
 * credential's proof and re-publish it from the same fetch, so the purpose must not be rewritten globally:
 * the normalisation applies only inside {@link withNormalisedBitstringStatusPurpose}, and it returns a copy
 * rather than mutating what was fetched.
 */

const normaliseScope = new AsyncLocalStorage<true>();
let installed = false;

export function normaliseStatusPurpose(statusPurpose: unknown): unknown {
	if (typeof statusPurpose === 'string') return [statusPurpose];
	return statusPurpose;
}

type FetchedBitstringList = {
	bitstringStatusListCredential?: { credentialSubject?: { statusPurpose?: unknown } & Record<string, unknown> };
} & Record<string, unknown>;

export function normaliseFetchedBitstringList<T>(list: T): T {
	const fetched = list as FetchedBitstringList | null | undefined;
	const subject = fetched?.bitstringStatusListCredential?.credentialSubject;
	if (!fetched || !subject || typeof subject.statusPurpose !== 'string') return list;
	return {
		...fetched,
		bitstringStatusListCredential: {
			...fetched.bitstringStatusListCredential,
			credentialSubject: { ...subject, statusPurpose: normaliseStatusPurpose(subject.statusPurpose) },
		},
	} as T;
}

export function installBitstringStatusPurposeNormaliser(): void {
	if (installed) return;
	const original = Cheqd.fetchBitstringStatusList;
	Cheqd.fetchBitstringStatusList = async function (
		this: unknown,
		...args: Parameters<typeof Cheqd.fetchBitstringStatusList>
	) {
		const list = await original.apply(this, args);
		return normaliseScope.getStore() ? normaliseFetchedBitstringList(list) : list;
	} as typeof Cheqd.fetchBitstringStatusList;
	installed = true;
}

/** Runs `fn` with fetched Bitstring status lists reporting `statusPurpose` as an array. */
export function withNormalisedBitstringStatusPurpose<T>(fn: () => Promise<T>): Promise<T> {
	installBitstringStatusPurposeNormaliser();
	return normaliseScope.run(true, fn);
}
