import { describe, expect, it } from '@jest/globals';
import {
	credentialArtifact,
	didArtifact,
	statusListArtifact,
	statusListArtifactFromCredential,
	statusListReference,
} from '../../../../src/services/identity/engine/artifact-refs.js';

const issuer = 'did:cheqd:testnet:5f3b3b2e-0000-4000-8000-000000000001';
const location = `https://resolver.cheqd.net/1.0/identifiers/${issuer}?resourceName=my-list&resourceType=StatusList2021Revocation`;

function jwt(payload: object): string {
	return `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
}

describe('artifact references', () => {
	it('builds did and credential references, or nothing without an id', () => {
		expect(didArtifact(issuer)).toEqual({ kind: 'did', id: issuer });
		expect(credentialArtifact('c1')).toEqual({ kind: 'credential', id: 'c1' });
		expect(didArtifact(undefined)).toBeUndefined();
		expect(credentialArtifact('')).toBeUndefined();
	});

	it('finds no status list without an external database', async () => {
		const before = process.env.ENABLE_EXTERNAL_DB;
		process.env.ENABLE_EXTERNAL_DB = 'false';
		try {
			expect(await statusListArtifact(issuer, 'my-list', 'c1')).toBeUndefined();
			expect(await statusListArtifactFromCredential({ issuer }, 'c1')).toBeUndefined();
		} finally {
			process.env.ENABLE_EXTERNAL_DB = before;
		}
	});
});

describe('statusListReference', () => {
	it('reads a Bitstring status entry', () => {
		expect(
			statusListReference({ issuer: { id: issuer }, credentialStatus: { statusListCredential: location } })
		).toEqual({ issuer, resourceName: 'my-list' });
	});

	it('reads a StatusList2021 entry, whose location is the entry id', () => {
		expect(
			statusListReference({ issuer, credentialStatus: { id: location, type: 'StatusList2021Entry' } })
		).toEqual({
			issuer,
			resourceName: 'my-list',
		});
	});

	it('reads a JWT credential, with and without the vc wrapper', () => {
		expect(statusListReference(jwt({ iss: issuer, vc: { credentialStatus: { id: location } } }))).toEqual({
			issuer,
			resourceName: 'my-list',
		});
		expect(statusListReference(jwt({ issuer, credentialStatus: [{ statusListCredential: location }] }))).toEqual({
			issuer,
			resourceName: 'my-list',
		});
	});

	it('uses the first credential of a list', () => {
		expect(statusListReference([{ issuer, credentialStatus: { id: location } }, { issuer: 'other' }])).toEqual({
			issuer,
			resourceName: 'my-list',
		});
	});

	it.each<[string, unknown]>([
		['no status entry', { issuer }],
		['no resourceName', { issuer, credentialStatus: { id: `https://x.test/${issuer}` } }],
		['a location that is not a URL', { issuer, credentialStatus: { id: 'not a url' } }],
		['no issuer', { credentialStatus: { id: location } }],
		['garbage', 'not.a.jwt'],
		['nothing', undefined],
		['an empty list', []],
	])('gives undefined for %s', (_name, input) => {
		expect(statusListReference(input as never)).toBeUndefined();
	});
});
