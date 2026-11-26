/**
 * T2 / R-012: account B must never read or change account A's DIDs, keys, resources, status lists, credentials or
 * operations. Every case runs as a control (owner) and an attack (other tenant); see cases.ts.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { startHarness, type Harness } from './harness/app.js';
import { ledgerCases, readCases, type Case } from './cases.js';
import { extraCases } from './cases-extra.js';
import { bugLabel, callsTo, expectNoLeak, expectNotSuccessful, itFor, mentions, normaliseEchoes } from './helpers.js';

let h: Harness;

beforeAll(async () => {
	h = await startHarness();
});
afterAll(async () => {
	await h?.close();
});
beforeEach(() => h.resetRecorders());
afterEach(async () => {
	await h.restoreOwnership(h.tenantA);
	await h.restoreOwnership(h.tenantB);
});

function authorised(c: Case, status: number, text: string, victimOrOwner: { markers: string[] }) {
	switch (c.oracle.kind) {
		case 'ledger':
			return callsTo(c.oracle.reach).length > 0;
		case 'response':
			return c.oracle.reached(status, text);
		case 'read-one':
			return status >= 200 && status < 300;
		case 'implicit':
			return status >= 200 && status < 300 && victimOrOwner.markers.some((m) => text.includes(m));
	}
}

describe.each([...ledgerCases, ...readCases, ...extraCases])('$route: $title', (c) => {
	it(`[${c.route}] control: the owner is authorised`, async () => {
		const owner = h.tenantB;
		c.prepare?.(h, owner);
		const req = c.request(owner, h);
		const res = await h.request(req.method, req.path, { ...req, as: owner });
		// eslint-disable-next-line no-console
		console.info(
			`control ${c.route} -> ${res.status} ${res.text.slice(0, 160)} calls=${h.allWrites().map((x) => x.method)}`
		);
		if (c.oracle.kind === 'read-one' && c.route.startsWith('PUT')) {
			expect(res.status).toBeLessThan(300);
		} else {
			expect({ route: c.route, authorised: authorised(c, res.status, res.text, owner) }).toEqual({
				route: c.route,
				authorised: true,
			});
		}
	});

	itFor(it, c.knownBug)(
		`[${c.route}] attack: another tenant is refused, learns nothing, changes nothing${bugLabel(c.knownBug)}`,
		async () => {
			const victim = h.tenantA;
			const attacker = h.tenantB;
			c.prepare?.(h, victim);
			const before = await h.snapshot(victim);
			const req = c.request(victim, h);
			const res = await h.request(req.method, req.path, { ...req, as: attacker });
			// eslint-disable-next-line no-console
			console.info(`attack ${c.route} -> ${res.status} ${res.text.slice(0, 160)}`);

			// The defect-bearing assertions come first, so a known bug fails for its own reason and not an incidental one.
			if (c.oracle.kind === 'ledger') {
				expect(callsTo(c.oracle.reach).filter((call) => mentions(call.args, victim).length > 0)).toEqual([]);
				expect(callsTo(c.oracle.reach)).toEqual([]);
			}
			await c.extraAssert?.(h, attacker, victim);
			if (c.oracle.kind !== 'implicit') expectNotSuccessful(res);
			// Not yours looks like not found: 404, never 403 (authn-authz 4.1 rule 3).
			if (c.oracle.kind !== 'implicit')
				expect({ route: c.route, status: res.status }).toEqual({ route: c.route, status: 404 });
			expectNoLeak(res, victim, req);
			expect(await h.snapshot(victim)).toEqual(before);
		}
	);

	// "Not found" and "not yours" must be indistinguishable: same status, same body (identifiers the caller sent aside).
	if (c.oracle.kind !== 'implicit' && c.twin !== false) {
		itFor(it, c.knownBug)(
			`[${c.route}] a missing artefact and another tenant's artefact get the same 404 and body${bugLabel(c.knownBug)}`,
			async () => {
				const victim = h.tenantA;
				const attacker = h.tenantB;
				const ghost = h.ghost();

				c.prepare?.(h, victim);
				const notYours = c.request(victim, h);
				const refused = await h.request(notYours.method, notYours.path, { ...notYours, as: attacker });

				h.resetRecorders();
				c.prepare?.(h, ghost);
				const missing = c.request(ghost, h);
				const absent = await h.request(missing.method, missing.path, { ...missing, as: attacker });

				expect(absent.status).toBe(404);
				expect(refused.status).toBe(absent.status);
				expect(normaliseEchoes(absent.text, ghost, victim)).toEqual(refused.text);
				expect(absent.headers.get('content-type')).toEqual(refused.headers.get('content-type'));
			}
		);
	}
});
