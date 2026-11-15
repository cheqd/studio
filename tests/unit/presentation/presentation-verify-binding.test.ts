import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { validationResult } from 'express-validator';

// POST /presentation/verify must carry the verifier's own challenge for the Credo engine. The engine is faked here;
// the engine's own refusal is covered in the Credo engine tests.
const verifyPresentation = jest.fn<(...args: any[]) => Promise<unknown>>();

jest.unstable_mockModule('../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		routed = async () => ({ verifyPresentation });
	},
}));
jest.unstable_mockModule('../../../src/services/helpers.js', () => ({ isIssuerDidDeactivated: async () => false }));
jest.unstable_mockModule('../../../src/services/track/tracker.js', () => ({ eventTracker: { emit: () => true } }));

const { PresentationController } = await import('../../../src/controllers/api/presentation.js');
const { PresentationBindingRequiredError } = await import('../../../src/services/identity/engine/credo/errors.js');

function respond() {
	const response = { statusCode: 0, body: undefined as unknown } as Response & { statusCode: number; body: any };
	response.locals = { customer: { customerId: 'c-1' }, user: {} };
	response.status = ((code: number) => {
		response.statusCode = code;
		return response;
	}) as never;
	response.json = ((body: unknown) => {
		response.body = body;
		return response;
	}) as never;
	return response;
}

const presentation = { type: ['VerifiablePresentation'], holder: 'did:cheqd:testnet:abc', proof: { jwt: 'a.b.c' } };
const verify = async (body: Record<string, unknown>) => {
	const response = respond();
	await new PresentationController().verifyPresentation(
		{ body: { presentation, ...body }, query: {} } as unknown as Request,
		response
	);
	return response;
};

beforeEach(() => {
	verifyPresentation.mockReset();
});

describe('POST /presentation/verify challenge handling', () => {
	it('passes the caller-supplied challenge and domain to the engine', async () => {
		verifyPresentation.mockResolvedValue({ verified: true });
		const response = await verify({ challenge: 'c-123', verifierDid: 'did:cheqd:testnet:verifier' });
		expect(response.statusCode).toBe(200);
		expect((verifyPresentation.mock.calls[0] as any[])[1]).toMatchObject({
			challenge: 'c-123',
			domain: 'did:cheqd:testnet:verifier',
		});
	});

	it('answers 400 invalid_request when the engine reports a missing challenge', async () => {
		verifyPresentation.mockRejectedValue(new PresentationBindingRequiredError('challenge'));
		const response = await verify({ verifierDid: 'did:cheqd:testnet:verifier' });
		expect(response.statusCode).toBe(400);
		expect(response.body).toMatchObject({ verified: false, code: 'invalid_request' });
		expect(response.body.error).toContain('challenge');
	});

	it('answers 400 invalid_request when the engine reports a missing domain', async () => {
		verifyPresentation.mockRejectedValue(new PresentationBindingRequiredError('domain'));
		const response = await verify({ challenge: 'c-123' });
		expect(response.statusCode).toBe(400);
		expect(response.body).toMatchObject({ verified: false, code: 'invalid_request' });
		expect(response.body.error).toContain('verifierDid');
	});
});

describe('presentation validators', () => {
	const run = async (chains: any[], body: Record<string, unknown>) => {
		const req: any = { body, query: {}, params: {}, headers: {} };
		for (const chain of chains) await chain.run(req);
		return validationResult(req)
			.array()
			.filter((e: any) => e.path === 'challenge');
	};

	it.each([[{}], [{ challenge: 'abc' }]])('accepts challenge %j', async (body) => {
		expect(await run(PresentationController.presentationVerifyValidator, body)).toEqual([]);
		expect(await run(PresentationController.presentationCreateValidator, body)).toEqual([]);
	});

	it.each([[{ challenge: '' }], [{ challenge: 5 }], [{ challenge: 'x'.repeat(1025) }]])(
		'rejects challenge %j',
		async (body) => {
			expect((await run(PresentationController.presentationVerifyValidator, body)).length).toBeGreaterThan(0);
		}
	);
});
