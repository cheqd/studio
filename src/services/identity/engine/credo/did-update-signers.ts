/**
 * Which keys must sign a did:cheqd update, by the rule `@cheqd/sdk` checks before it broadcasts
 * (`DIDModule.validateAuthenticationAgainstSignaturesKeyRotation`). The SDK refuses a missing signature and also an
 * extra one ("signature from key … is not required").
 *
 * Credo's registrar signs every update with every `authentication` key of the new document plus the
 * `authentication` keys the update removes. That matches the SDK for an ordinary update and for adding a key, but
 * not for a key replacement (an `authentication` key removed and another added in the same update, which is what an
 * agent key rotation is): there the SDK wants the added and the removed keys only, so the keys that stay must not
 * sign. Every agent key rotation therefore failed before broadcast.
 *
 * Returns the full DID URLs of the keys that must sign, or `null` when Credo's own choice already matches the SDK (or
 * the SDK does not check, as with an external controller) and nothing should be filtered.
 */

type DocumentLike = {
	id?: unknown;
	controller?: unknown;
	authentication?: unknown;
	verificationMethod?: unknown;
};

type MethodLike = {
	id?: unknown;
	publicKeyBase58?: unknown;
	publicKeyMultibase?: unknown;
	publicKeyJwk?: { x?: unknown } | null;
};

const absolute = (did: string, id: string) => (id.startsWith('#') ? `${did}${id}` : id);

function authenticationIds(document: DocumentLike): string[] {
	const did = String(document.id ?? '');
	const listed = Array.isArray(document.authentication)
		? document.authentication
		: document.authentication
			? [document.authentication]
			: [];
	return listed
		.map((entry) => (typeof entry === 'string' ? entry : (entry as { id?: unknown } | null)?.id))
		.filter((id): id is string => typeof id === 'string')
		.map((id) => absolute(did, id));
}

function controllers(document: DocumentLike): string[] {
	const controller = document.controller;
	if (Array.isArray(controller)) return controller.filter((c): c is string => typeof c === 'string');
	if (typeof controller === 'string') return [controller];
	return typeof document.id === 'string' ? [document.id] : [];
}

function methods(document: DocumentLike): MethodLike[] {
	return Array.isArray(document.verificationMethod) ? (document.verificationMethod as MethodLike[]) : [];
}

export function requiredUpdateSigners(
	next: DocumentLike,
	previous: DocumentLike | null | undefined
): Set<string> | null {
	if (!previous || typeof next.id !== 'string') return null;
	const did = next.id;

	// External controllers: the SDK does not check the signature set, and the ledger needs the controllers' keys
	if ([...controllers(next), ...controllers(previous)].some((controller) => controller !== did)) return null;

	// Same id with new material (a rotation in place): Credo's set is not what the SDK wants either, but Studio never
	// does this; leave it to Credo rather than guess
	const previousMethods = methods(previous);
	const rotatedInPlace = methods(next).some((method) =>
		previousMethods.some(
			(old) =>
				old.id === method.id &&
				(old.publicKeyBase58 !== method.publicKeyBase58 ||
					old.publicKeyMultibase !== method.publicKeyMultibase ||
					old.publicKeyJwk?.x !== method.publicKeyJwk?.x)
		)
	);
	if (rotatedInPlace) return null;

	const current = new Set(authenticationIds(next));
	const before = new Set(authenticationIds(previous));
	const removed = [...before].filter((id) => !current.has(id));
	const added = [...current].filter((id) => !before.has(id));
	if (removed.length === 0 || added.length === 0) return null;

	return new Set([...added, ...removed]);
}
