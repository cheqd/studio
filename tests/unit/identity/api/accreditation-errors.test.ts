import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

// Trust-registry error statuses. Issuing on a parent accreditation that does not verify must not answer 200, and a
// typed engine error raised while revoking, suspending or reinstating must reach the client with its mapped status
// (501, 404, 503) rather than a generic 500. The identity service, the engine router and the credential tracking are
// faked; the services and controller under test are the real ones.
const ISSUER = 'did:cheqd:testnet:aaaaaaaa-0000-4000-8000-000000000001';
const SUBJECT = 'did:cheqd:testnet:aaaaaaaa-0000-4000-8000-000000000002';
const PARENT_URL = `${ISSUER}/resources/aaaaaaaa-1111-4111-8111-111111111111`;
const ACCREDITATION_URL = `${ISSUER}/resources/aaaaaaaa-2222-4222-8222-222222222222`;

const statusChange = jest.fn<(...args: any[]) => Promise<unknown>>();
const verifyAccreditation = jest.fn<(...args: any[]) => Promise<unknown>>();
const issueCredential = jest.fn<(...args: any[]) => Promise<unknown>>();

jest.unstable_mockModule('../../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		agent = {
			resolveDid: async () => ({ didDocument: {}, didDocumentMetadata: {}, didResolutionMetadata: {} }),
			resolve: async () => ({
				json: async () => ({ issuer: { id: ISSUER }, credentialStatus: { type: 'BitstringStatusListEntry' } }),
			}),
		};
		routed = async () => ({
			revokeCredentials: statusChange,
			suspendCredentials: statusChange,
			reinstateCredentials: statusChange,
		});
	},
}));
jest.unstable_mockModule('../../../../src/services/identity/engine/artifact-refs.js', () => ({
	statusListArtifactFromCredential: async () => undefined,
}));
jest.unstable_mockModule('../../../../src/services/identity/engine/db-lookups.js', () => ({
	engineRouter: { engineFor: async () => ({ verifyAccreditation }) },
}));
jest.unstable_mockModule('../../../../src/services/api/credentials.js', () => ({
	Credentials: { instance: { issue_credential: issueCredential, recordStatusChange: async () => undefined } },
}));
jest.unstable_mockModule('../../../../src/services/track/tracker.js', () => ({ eventTracker: { emit: () => true } }));

const { AccreditationController } = await import('../../../../src/controllers/api/accreditation.js');
const { NotImplementedByEngineError, CredoOwnershipError } =
	await import('../../../../src/services/identity/engine/credo/errors.js');
const { LedgerUnavailableError } = await import('../../../../src/services/identity/ledger-lock.js');

function respond() {
	const response = {
		statusCode: 0,
		body: undefined as unknown,
		headers: {} as Record<string, string>,
	} as Response & {
		statusCode: number;
		body: any;
		headers: Record<string, string>;
	};
	response.locals = { customer: { customerId: 'c-1' }, user: {} };
	response.status = ((code: number) => {
		response.statusCode = code;
		return response;
	}) as never;
	response.json = ((body: unknown) => {
		response.body = body;
		return response;
	}) as never;
	response.setHeader = ((name: string, value: string) => {
		response.headers[name] = value;
		return response;
	}) as never;
	return response;
}

beforeEach(() => {
	statusChange.mockReset();
	verifyAccreditation.mockReset();
	issueCredential.mockReset();
});

describe('POST /trust-registry/accreditation/issue with an invalid parent accreditation', () => {
	const issue = async () => {
		const response = respond();
		await new AccreditationController().issue(
			{
				query: { accreditationType: 'attest' },
				body: {
					issuerDid: ISSUER,
					subjectDid: SUBJECT,
					schemas: [{ url: 'https://schema.org/Learn', types: ['Learn'] }],
					accreditationName: 'learn',
					parentAccreditation: PARENT_URL,
					rootAuthorization: PARENT_URL,
				},
			} as unknown as Request,
			response
		);
		return response;
	};

	it('answers 400, not 200, when the parent chain verifies as invalid', async () => {
		// The chain walk reports an unverified chain as a 200 verification result
		verifyAccreditation.mockResolvedValue({ success: false, status: 200, error: 'Accreditation is revoked' });
		const response = await issue();
		expect(response.statusCode).toBe(400);
		expect(response.body.error).toContain('Root Authorization or parent Accreditation is not valid');
		expect(issueCredential).not.toHaveBeenCalled();
	});

	it('keeps a 4xx the chain walk already chose', async () => {
		verifyAccreditation.mockResolvedValue({ success: false, status: 404, error: 'not found' });
		const response = await issue();
		expect(response.statusCode).toBe(404);
	});

	it('maps an engine error raised while issuing', async () => {
		verifyAccreditation.mockResolvedValue({ success: true, status: 200, data: {} });
		issueCredential.mockRejectedValue(new NotImplementedByEngineError('credo', 'issueCredential'));
		const response = await issue();
		expect(response.statusCode).toBe(501);
		expect(response.body.code).toBe('NotImplemented');
	});
});

describe.each(['revoke', 'suspend', 'reinstate'] as const)('POST /trust-registry/accreditation/%s', (action) => {
	const run = async () => {
		const response = respond();
		await new AccreditationController()[action](
			{ query: { publish: true }, body: { didUrl: ACCREDITATION_URL } } as unknown as Request,
			response
		);
		return response;
	};

	it('answers 501 when the engine does not implement it', async () => {
		statusChange.mockRejectedValue(new NotImplementedByEngineError('credo', `${action}Credentials`));
		const response = await run();
		expect(response.statusCode).toBe(501);
		expect(response.body).toMatchObject({ code: 'NotImplemented' });
	});

	it('answers 404 when the engine does not own the accreditation', async () => {
		statusChange.mockRejectedValue(new CredoOwnershipError(ISSUER));
		const response = await run();
		expect(response.statusCode).toBe(404);
		expect(response.body).toMatchObject({ code: 'not_found' });
	});

	it('answers 503 with Retry-After when the ledger is busy', async () => {
		statusChange.mockRejectedValue(new LedgerUnavailableError('busy', 7));
		const response = await run();
		expect(response.statusCode).toBe(503);
		expect(response.headers['Retry-After']).toBe('7');
	});

	it('still answers 500 for an unexpected error', async () => {
		statusChange.mockRejectedValue(new Error('boom'));
		const response = await run();
		expect(response.statusCode).toBe(500);
		expect(response.body.error).toBe('Internal error: boom');
	});
});
