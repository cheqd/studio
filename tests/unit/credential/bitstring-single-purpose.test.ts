/**
 * U-67: issuing against a Bitstring list created with a single purpose failed on Veramo with
 * "statusPurpose must be one of m, e, s, s, a, g, e", because did-provider-cheqd reads the stored string
 * purpose letter by letter. These tests drive the real plugin method through Studio's Veramo wrapper with
 * the list fetch stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Cheqd } from '@cheqd/did-provider-cheqd';
import type { CredentialPayload } from '@veramo/core';
import { Veramo } from '../../../src/services/identity/providers/studio/agent.js';
import {
	normaliseFetchedBitstringList,
	withNormalisedBitstringStatusPurpose,
} from '../../../src/services/identity/providers/studio/bitstring-status-purpose.js';
import { StatusListType } from '../../../src/types/credential-status.js';
import type { StatusOptions } from '../../../src/types/credential-status.js';

const issuer = 'did:cheqd:testnet:6e4fd1c4-3e0f-4a3c-8d8c-1f9a9a2a1c11';

function publishedList(statusPurpose: string | string[]) {
	return {
		bitstringStatusListCredential: {
			'@context': ['https://www.w3.org/ns/credentials/v2'],
			type: ['VerifiableCredential', 'BitstringStatusListCredential'],
			issuer: { id: issuer },
			credentialSubject: { id: 'list', type: 'BitstringStatusList', statusPurpose, encodedList: 'H4sI' },
		},
		metadata: {
			statusSize: 2,
			statusMessages: [
				{ status: '0x0', message: 'valid' },
				{ status: '0x1', message: 'revoked' },
				{ status: '0x2', message: 'suspended' },
				{ status: '0x3', message: 'unknown' },
			],
			length: 131072,
		},
	};
}

function fakeAgent() {
	const plugin = new Cheqd({ providers: [{ network: 'testnet' }] } as unknown as ConstructorParameters<
		typeof Cheqd
	>[0]);
	const inner = {
		createVerifiableCredential: jest.fn(async (args: { credential: CredentialPayload }) => ({
			...args.credential,
			proof: { type: 'JwtProof2020', jwt: 'x' },
		})),
	};
	return {
		cheqdIssueCredentialWithStatusList: (args: unknown) =>
			plugin.methods!.cheqdIssueCredentialWithStatusList(args as never, { agent: inner } as never),
	};
}

const credential: CredentialPayload = {
	issuer: { id: issuer },
	credentialSubject: { id: 'did:key:z6MkholderX' },
	issuanceDate: new Date().toISOString(),
};

function statusOptions(statusPurpose: string): StatusOptions {
	return {
		statusListType: StatusListType.Bitstring,
		statusListName: 'list',
		statusPurpose,
	} as unknown as StatusOptions;
}

describe('Bitstring issuance against stored statusPurpose (U-67)', () => {
	let fetchSpy: ReturnType<typeof jest.spyOn>;
	let stored: string | string[];

	beforeEach(() => {
		fetchSpy = jest
			.spyOn(globalThis, 'fetch')
			.mockImplementation(async () => new Response(JSON.stringify(publishedList(stored)), { status: 200 }));
	});
	afterEach(() => fetchSpy.mockRestore());

	it('the unpatched plugin rejects a single-purpose list (reproduces the bug)', async () => {
		stored = 'message';
		const agent = fakeAgent();
		await expect(
			agent.cheqdIssueCredentialWithStatusList({
				issuanceOptions: { credential },
				statusOptions: { statusListName: 'list', statusPurpose: 'message' },
			})
		).rejects.toThrow('statusPurpose must be one of m, e, s, s, a, g, e');
	});

	it('issues against a single-purpose list', async () => {
		stored = 'message';
		const vc = await Veramo.instance.issueCredential(
			fakeAgent() as never,
			credential,
			'jwt',
			statusOptions('message')
		);
		expect(vc.credentialStatus).toMatchObject({ type: 'BitstringStatusListEntry', statusPurpose: 'message' });
	});

	it('rejects a purpose the single-purpose list does not declare', async () => {
		stored = 'message';
		await expect(
			Veramo.instance.issueCredential(fakeAgent() as never, credential, 'jwt', statusOptions('refresh'))
		).rejects.toThrow('statusPurpose must be one of message');
	});

	it('issues against a list with several purposes', async () => {
		stored = ['refresh', 'message'];
		const vc = await Veramo.instance.issueCredential(
			fakeAgent() as never,
			credential,
			'jwt',
			statusOptions('refresh')
		);
		expect(vc.credentialStatus).toMatchObject({ statusPurpose: 'refresh' });
	});

	it('leaves the fetched list untouched outside an issuance', async () => {
		stored = 'message';
		await withNormalisedBitstringStatusPurpose(async () => undefined);
		const list = (await Cheqd.fetchBitstringStatusList({
			credentialStatus: { id: `https://resolver/1.0/identifiers/${issuer}?resourceName=list` },
		} as never)) as ReturnType<typeof publishedList>;
		expect(list.bitstringStatusListCredential.credentialSubject.statusPurpose).toBe('message');
	});

	it('normalises a copy and does not mutate the fetched list', () => {
		const original = publishedList('message');
		const normalised = normaliseFetchedBitstringList(original);
		expect(normalised.bitstringStatusListCredential.credentialSubject.statusPurpose).toEqual(['message']);
		expect(original.bitstringStatusListCredential.credentialSubject.statusPurpose).toBe('message');
		const multi = publishedList(['refresh', 'message']);
		expect(normaliseFetchedBitstringList(multi)).toBe(multi);
	});
});
