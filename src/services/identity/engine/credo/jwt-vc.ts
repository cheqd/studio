import type { EngineSigningAlg, JsonObject, JsonValue } from '../types.js';

/**
 * JWT credential and presentation encoding for the Credo engine. Pure functions, no Credo imports.
 *
 * The shapes are the ones Veramo writes today (and that `credential-issue-jwt.json` records): the W3C
 * VC-as-JWT mapping, `iss`, `sub`, `jti`, `nbf` and `exp` in the claims and the rest of the credential under `vc`,
 * and the credential Studio returns is the JSON form with `proof: { type: 'JwtProof2020', jwt }`. Credo reads the
 * same encoding, which is what makes a Veramo credential verify in Credo and the reverse.
 */

export const JWT_PROOF_TYPE = 'JwtProof2020';
export const CREDENTIALS_V1 = 'https://www.w3.org/2018/credentials/v1';

const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array | string) => Buffer.from(bytes).toString('base64url');

export interface DecodedJwt {
	header: JsonObject;
	payload: JsonObject;
	signature: string;
}

export function decodeJwt(compact: string): DecodedJwt | null {
	const parts = compact.split('.');
	if (parts.length !== 3) return null;
	try {
		const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
		const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
		if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') return null;
		return { header, payload, signature: parts[2] };
	} catch {
		return null;
	}
}

const isObject = (value: unknown): value is JsonObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = <T>(value: T | T[] | undefined): T[] =>
	value === undefined ? [] : Array.isArray(value) ? value : [value];

export const issuerId = (issuer: unknown): string | undefined =>
	typeof issuer === 'string' ? issuer : isObject(issuer) && typeof issuer.id === 'string' ? issuer.id : undefined;

const seconds = (date: JsonValue | undefined): number | undefined => {
	if (typeof date !== 'string') return undefined;
	const ms = Date.parse(date);
	return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
};

const iso = (epochSeconds: unknown): string | undefined =>
	typeof epochSeconds === 'number' ? new Date(epochSeconds * 1000).toISOString() : undefined;

/** A credential ready to sign: issuer as `{ id }`, an issuance date, the base `@context` and `type`. */
export function normaliseCredentialPayload(credential: JsonObject, now = new Date()): JsonObject {
	const context = asArray(credential['@context'] as JsonValue | JsonValue[] | undefined);
	const type = asArray(credential.type as JsonValue | JsonValue[] | undefined);
	const issuer = credential.issuer;
	return {
		...credential,
		'@context': context.includes(CREDENTIALS_V1) ? context : [CREDENTIALS_V1, ...context],
		type: type.includes('VerifiableCredential') ? type : ['VerifiableCredential', ...type],
		issuer: isObject(issuer) ? issuer : { id: issuerId(issuer) as string },
		issuanceDate: typeof credential.issuanceDate === 'string' ? credential.issuanceDate : now.toISOString(),
	};
}

/** The JWT claims for a credential (`removeOriginalFields`: what moves into the claims leaves `vc`). */
export function credentialToJwtPayload(credential: JsonObject): JsonObject {
	const { issuer, issuanceDate, expirationDate, id, credentialSubject, ...rest } = credential;
	const subjects = asArray(credentialSubject as JsonObject | JsonObject[] | undefined);
	const single = subjects.length === 1 && !Array.isArray(credentialSubject) ? subjects[0] : undefined;
	const { id: subjectId, ...subjectClaims } = single ?? {};

	const vc: JsonObject = { ...rest };
	vc.credentialSubject = single ? subjectClaims : (credentialSubject as JsonValue);
	const issuerObject = isObject(issuer) ? issuer : undefined;
	if (issuerObject && Object.keys(issuerObject).some((key) => key !== 'id')) vc.issuer = issuerObject;

	const payload: JsonObject = { iss: issuerId(issuer), vc };
	if (typeof subjectId === 'string') payload.sub = subjectId;
	if (typeof id === 'string') payload.jti = id;
	const nbf = seconds(issuanceDate as JsonValue);
	if (nbf !== undefined) payload.nbf = nbf;
	const exp = seconds(expirationDate as JsonValue);
	if (exp !== undefined) payload.exp = exp;
	return payload;
}

/** The JSON credential Studio returns for a JWT credential: the claims folded back in, and the proof. */
export function jwtToCredential(compact: string): JsonObject | null {
	const decoded = decodeJwt(compact);
	const vc = decoded && isObject(decoded.payload.vc) ? decoded.payload.vc : null;
	if (!decoded || !vc) return null;
	const { payload } = decoded;

	const subject = vc.credentialSubject;
	const subjectWithId =
		typeof payload.sub === 'string' && isObject(subject) && !Array.isArray(subject)
			? { ...subject, id: payload.sub }
			: subject;
	const issuer = isObject(vc.issuer) ? vc.issuer : { id: payload.iss as string };

	const credential: JsonObject = {
		...vc,
		credentialSubject: subjectWithId,
		issuer,
		...(typeof payload.jti === 'string' ? { id: payload.jti } : {}),
	};
	const issuanceDate = iso(payload.nbf) ?? iso(payload.iat);
	if (issuanceDate) credential.issuanceDate = issuanceDate;
	const expirationDate = iso(payload.exp);
	if (expirationDate) credential.expirationDate = expirationDate;
	credential.proof = { type: JWT_PROOF_TYPE, jwt: compact };
	return credential;
}

/** The compact JWT of a credential or presentation as Studio holds it: a string, or an object with `proof.jwt`. */
export function compactJwtOf(input: unknown): string | null {
	if (typeof input === 'string') return decodeJwt(input) ? input : null;
	if (isObject(input) && isObject(input.proof) && typeof input.proof.jwt === 'string') return input.proof.jwt;
	return null;
}

export interface JwtParts {
	header: JsonObject;
	payload: JsonObject;
}

/** The bytes a JWS signs: `base64url(header) '.' base64url(payload)`. */
export function signingInput({ header, payload }: JwtParts): Uint8Array {
	return encoder.encode(`${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`);
}

export function assembleJwt(parts: JwtParts, signature: Uint8Array): string {
	return `${Buffer.from(signingInput(parts)).toString('utf8')}.${base64url(signature)}`;
}

export function jwtHeader(alg: EngineSigningAlg, kid: string): JsonObject {
	return { alg, typ: 'JWT', kid };
}

export interface PresentationJwtOptions {
	holder: string;
	challenge?: string;
	domain?: string;
	now?: Date;
}

/** The claims of a JWT presentation. Credentials stay as the JWT strings they are, so their signatures are untouched. */
export function presentationToJwtPayload(presentation: JsonObject, options: PresentationJwtOptions): JsonObject {
	const { holder, verifiableCredential, issuanceDate, expirationDate, id, ...rest } = presentation;
	const vp: JsonObject = { ...rest, verifiableCredential: verifiableCredential as JsonValue };
	const payload: JsonObject = { iss: options.holder, vp };
	const nbf = seconds(issuanceDate as JsonValue) ?? Math.floor((options.now ?? new Date()).getTime() / 1000);
	payload.nbf = nbf;
	const exp = seconds(expirationDate as JsonValue);
	if (exp !== undefined) payload.exp = exp;
	if (typeof id === 'string') payload.jti = id;
	if (options.domain) payload.aud = [options.domain];
	if (options.challenge) payload.nonce = options.challenge;
	return payload;
}

/** The JSON presentation Studio returns for a JWT presentation, with its credentials in JSON form. */
export function jwtToPresentation(compact: string): JsonObject | null {
	const decoded = decodeJwt(compact);
	const vp = decoded && isObject(decoded.payload.vp) ? decoded.payload.vp : null;
	if (!decoded || !vp) return null;
	const { payload } = decoded;
	const credentials = asArray(vp.verifiableCredential as JsonValue | JsonValue[] | undefined).map((credential) =>
		typeof credential === 'string' ? (jwtToCredential(credential) ?? credential) : credential
	);
	const presentation: JsonObject = {
		...vp,
		holder: typeof vp.holder === 'string' ? vp.holder : (payload.iss as string),
		verifiableCredential: credentials,
	};
	const issuanceDate = iso(payload.nbf) ?? iso(payload.iat);
	if (issuanceDate) presentation.issuanceDate = issuanceDate;
	const expirationDate = iso(payload.exp);
	if (expirationDate) presentation.expirationDate = expirationDate;
	if (typeof payload.jti === 'string') presentation.id = payload.jti;
	presentation.proof = { type: JWT_PROOF_TYPE, jwt: compact };
	return presentation;
}
