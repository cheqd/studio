import { describe, expect, it, jest } from '@jest/globals';
import { Veramo } from '../../../../src/services/identity/providers/studio/agent.js';
import { deactivationGasLimit } from '../../../../src/services/identity/engine/deactivation-gas.js';
import type { VeramoAgent } from '../../../../src/types/shared.js';

const did = 'did:cheqd:testnet:0b8c4e0c-3c0a-4c55-8b4a-0f6b8e4b1d2a';
const didDocument = {
	id: did,
	service: [1, 2, 3].map((i) => ({
		id: `${did}#s${i}`,
		type: 'LinkedDomains',
		serviceEndpoint: 'https://a.example',
	})),
};

function fakeAgent() {
	const cheqdDeactivateIdentifier = jest.fn(async (_args: Record<string, unknown>) => true);
	const agent = {
		keyManagerGetKeyManagementSystems: async () => ['postgres'],
		resolveDid: async () => ({ didDocument, didDocumentMetadata: {}, didResolutionMetadata: {} }),
		cheqdDeactivateIdentifier,
	} as unknown as VeramoAgent;
	return { agent, cheqdDeactivateIdentifier };
}

const versionsAnswer = (count: number) =>
	new Response(JSON.stringify({ contentStream: { versions: Array.from({ length: count }, () => ({})) } }), {
		status: 200,
	});

describe('Veramo deactivateDid gas limit (U-62)', () => {
	it('passes a gas limit built from the resolver’s version count', async () => {
		const veramo = new Veramo();
		const resolve = jest.spyOn(veramo, 'resolve').mockResolvedValue(versionsAnswer(4));
		const { agent, cheqdDeactivateIdentifier } = fakeAgent();

		expect(await veramo.deactivateDid(agent, did)).toBe(true);

		expect(resolve).toHaveBeenCalledWith(`${did}/versions`, true);
		const args = cheqdDeactivateIdentifier.mock.calls[0][0];
		expect(args).toMatchObject({
			kms: 'postgres',
			document: didDocument,
			feeOptions: { gasLimit: deactivationGasLimit({ didDocument, versionCount: 4 }) },
		});
		// No explicit fee: the provider keeps the SDK's fee amount and only raises the gas limit
		expect(args).not.toHaveProperty('fee');
		expect(Number((args.feeOptions as { gasLimit: string }).gasLimit)).toBeGreaterThan(360_226);
	});

	it('falls back to the assumed version count when the resolver cannot answer', async () => {
		const veramo = new Veramo();
		jest.spyOn(veramo, 'resolve').mockRejectedValue(new Error('resolver down'));
		const { agent, cheqdDeactivateIdentifier } = fakeAgent();

		await veramo.deactivateDid(agent, did);

		expect(cheqdDeactivateIdentifier.mock.calls[0][0]).toMatchObject({
			feeOptions: { gasLimit: deactivationGasLimit({ didDocument }) },
		});
	});

	it('does not send a transaction for a DID that is already deactivated', async () => {
		const veramo = new Veramo();
		const resolve = jest.spyOn(veramo, 'resolve');
		const { agent, cheqdDeactivateIdentifier } = fakeAgent();
		(agent as unknown as { resolveDid: () => Promise<unknown> }).resolveDid = async () => ({
			didDocument,
			didDocumentMetadata: { deactivated: true },
			didResolutionMetadata: {},
		});

		expect(await veramo.deactivateDid(agent, did)).toBe(true);
		expect(cheqdDeactivateIdentifier).not.toHaveBeenCalled();
		expect(resolve).not.toHaveBeenCalled();
	});
});
