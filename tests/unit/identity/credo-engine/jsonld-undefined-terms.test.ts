import { describe, expect, it } from '@jest/globals';
import { CredoError, vcLibraries } from '@credo-ts/core';
import {
	collectUndefinedTerms,
	credentialSession,
	undefinedTermFailure,
} from '../../../../src/services/identity/engine/credo/credential-session.js';
import { CredoUndefinedTermsError } from '../../../../src/services/identity/engine/credo/errors.js';
import { mapEngineError } from '../../../../src/helpers/engine-errors.js';

/**
 * A JSON-LD credential whose attributes no `@context` defines cannot be signed. That is the caller's to fix, so it
 * must answer 400 naming every such attribute, not 500.
 */

const BASE = 'https://www.w3.org/2018/credentials/v1';
const SCHEMA = 'https://schema.org';

// Small stand-ins for the real contexts, served from memory: no network in unit tests
const contexts: Record<string, unknown> = {
	[BASE]: {
		'@context': {
			'@version': 1.1,
			id: '@id',
			type: '@type',
			VerifiableCredential: 'https://www.w3.org/2018/credentials#VerifiableCredential',
			issuer: { '@id': 'https://www.w3.org/2018/credentials#issuer', '@type': '@id' },
			issuanceDate: 'https://www.w3.org/2018/credentials#issuanceDate',
			credentialSubject: { '@id': 'https://www.w3.org/2018/credentials#credentialSubject', '@type': '@id' },
		},
	},
	[SCHEMA]: { '@context': { name: 'https://schema.org/name', jobTitle: 'https://schema.org/jobTitle' } },
};
const documentLoader = async (url: string) => {
	if (!(url in contexts)) throw new Error(`no context ${url}`);
	return { documentUrl: url, document: contexts[url], contextUrl: null };
};

const credential = (context: string[], subject: Record<string, unknown>) => ({
	'@context': context,
	type: ['VerifiableCredential'],
	issuer: 'did:cheqd:testnet:5f3b3b2e-0000-4000-8000-000000000001',
	issuanceDate: '2026-11-25T00:00:00Z',
	credentialSubject: { id: 'did:key:z6Mkexample', ...subject },
});

/** The error jsonld raises in safe mode, wrapped as Credo wraps it when signing. */
async function signingFailure(document: Record<string, unknown>): Promise<unknown> {
	const jsonLdError = await vcLibraries.jsonld
		.expand(document, { documentLoader, safe: true })
		.then(() => undefined)
		.catch((error: unknown) => error);
	return new CredoError(`Error issuing W3C JSON-LD VC. ${(jsonLdError as Error).message}`, { cause: jsonLdError });
}

describe('undefinedTermFailure', () => {
	it('recognises the safe-mode refusal of an undefined attribute through the Credo wrapper', async () => {
		const failure = undefinedTermFailure(await signingFailure(credential([BASE], { tag: 'x' })));
		expect(failure).toEqual({ term: 'tag' });
	});

	it('ignores any other failure', () => {
		expect(undefinedTermFailure(new Error('kms unavailable'))).toBeUndefined();
		expect(undefinedTermFailure(undefined)).toBeUndefined();
	});
});

describe('collectUndefinedTerms', () => {
	it('names every attribute no context defines', async () => {
		const terms = await collectUndefinedTerms(credential([BASE], { name: 'Ada', role: 'admin' }), documentLoader);
		expect(terms.sort()).toEqual(['name', 'role']);
	});

	it('names none once a context defines them', async () => {
		expect(await collectUndefinedTerms(credential([BASE, SCHEMA], { name: 'Ada' }), documentLoader)).toEqual([]);
	});
});

describe('signing a JSON-LD credential with undefined attributes', () => {
	const agent = (failure: unknown) => ({
		kms: {},
		modules: {},
		w3cCredentials: {
			signCredential: async () => {
				throw failure;
			},
		},
		context: { resolve: () => ({ documentLoader: () => documentLoader }) },
	});

	it('raises CredoUndefinedTermsError naming all of them', async () => {
		const document = credential([BASE], { name: 'Ada', role: 'admin' });
		const session = credentialSession(agent(await signingFailure(document)) as never);
		const error = await session
			.signJsonLdCredential({ credential: document, verificationMethod: 'did:x#key-1', proofType: 'x' })
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(CredoUndefinedTermsError);
		expect((error as CredoUndefinedTermsError).terms.sort()).toEqual(['name', 'role']);
		expect((error as Error).message).toContain("Add a context that defines them to '@context'");
	});

	it('still names the first one when the document loader is not available', async () => {
		const document = credential([BASE], { tag: 'x' });
		const failing = { ...agent(await signingFailure(document)), context: undefined };
		const error = await credentialSession(failing as never)
			.signJsonLdCredential({ credential: document, verificationMethod: 'did:x#key-1', proofType: 'x' })
			.catch((e: unknown) => e);
		expect((error as CredoUndefinedTermsError).terms).toEqual(['tag']);
	});

	it('passes any other signing failure through unchanged', async () => {
		const other = new Error('kms unavailable');
		const error = await credentialSession(agent(other) as never)
			.signJsonLdCredential({
				credential: credential([BASE], {}),
				verificationMethod: 'did:x#key-1',
				proofType: 'x',
			})
			.catch((e: unknown) => e);
		expect(error).toBe(other);
	});

	it('answers 400 with the code undefined_terms', () => {
		const mapped = mapEngineError(new CredoUndefinedTermsError(['tag']), { log: false });
		expect(mapped?.status).toBe(400);
		expect(mapped?.code).toBe('undefined_terms');
		expect(mapped?.error).toContain('tag');
	});
});
