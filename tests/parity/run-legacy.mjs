#!/usr/bin/env node
// Legacy-artefact parity: checks that artefacts created on Veramo (everything customers hold today) keep working after
// the Credo release. Two phases, staging and testnet only:
//
//   1. seed      run while the test customer's NEW artefacts still go to Veramo (VERAMO_NEW_ARTEFACT_OVERRIDE=true on
//                the instances and an engine flag of `veramo` for that customer). Creates DIDs, lists, credentials and
//                an accreditation chain, and saves them to $PARITY_STATE_FILE.
//   2. exercise  run after the flag is removed. Acts on the saved artefacts the way customers do, and mixes in new
//                (Credo) artefacts where customers would.
//
// Usage:
//   STUDIO_API_KEY_FILE=/path/key PARITY_STATE_FILE=/path/state.json node tests/parity/run-legacy.mjs seed|exercise
import fs from 'node:fs';
import crypto from 'node:crypto';

const API = process.env.STUDIO_API_URL || 'https://studio-api-staging.cheqd.net';
if (/studio-api\.cheqd\.net/.test(API)) {
	console.error('Refusing to run against the production API.');
	process.exit(2);
}
const KEY = fs.readFileSync(process.env.STUDIO_API_KEY_FILE, 'utf8').trim();
const STATE = process.env.PARITY_STATE_FILE;
const phase = process.argv[2];
if (!STATE || !['seed', 'exercise'].includes(phase)) {
	console.error('Usage: STUDIO_API_KEY_FILE=... PARITY_STATE_FILE=... node run-legacy.mjs seed|exercise');
	process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (s) => Buffer.from(s).toString('base64');
const SUBJECT = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
const MSGS = [
	{ status: '0x0', message: 'valid' },
	{ status: '0x1', message: 'revoked' },
	{ status: '0x2', message: 'suspended' },
	{ status: '0x3', message: 'unknown' },
];
const SCHEMAS = [{ types: ['VerifiableCredential', 'ParityTestCredential'], url: 'https://schema.org/Person' }];
const TRUST = { trustFramework: 'https://learn.cheqd.io/governance/start', trustFrameworkId: 'parity trust framework' };
const url = (did, n, t) => `${did}?resourceName=${n}&resourceType=${t}`;

async function api(method, route, body) {
	const headers = { 'x-api-key': KEY, Accept: 'application/json' };
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	if (method !== 'GET') headers['Idempotency-Key'] = crypto.randomUUID();
	const r = await fetch(API + route, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await r.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = undefined;
	}
	return { status: r.status, json, text };
}
const steps = [];
async function step(label, call, { check, known, rejection } = {}) {
	const res = await call();
	let verdict = rejection
		? res.status >= 400 && res.status < 500
			? true
			: `expected a 4xx refusal, got HTTP ${res.status}`
		: res.status >= 200 && res.status < 300 && !(res.json && res.json.error)
			? true
			: `HTTP ${res.status}`;
	if (verdict === true && check) verdict = check(res);
	const ok = verdict === true;
	const outcome = ok ? (known ? 'FIXED' : 'PASS') : known ? 'KNOWN' : 'FAIL';
	const reason = ok ? '' : `${verdict}${res.json?.error ? `: ${String(res.json.error).slice(0, 200)}` : ''}`;
	steps.push({ phase, step: label, outcome, known: known || '', status: res.status, reason });
	console.log(`  ${outcome.padEnd(5)} ${label}${reason ? `  (${reason})` : ''}`);
	return res;
}
const is = (f, why) => (r) => (f(r.json) ? true : `${why}: ${r.text.slice(0, 140)}`);

async function engines(dids) {
	const r = await api('GET', '/did/list?metadata=true&limit=100');
	const list = r.json?.dids || [];
	return Object.fromEntries(dids.map((d) => [d, list.find((x) => x.did === d)?.engine ?? 'unknown']));
}

async function seed() {
	const s = { createdAt: new Date().toISOString(), dids: {}, creds: {} };
	const bal = await api('GET', '/account/balances');
	if (Number(bal.json?.testnet?.balance?.cheq ?? 0) < 90000) {
		await api('POST', '/account/faucet', { amount: 100000 });
		await sleep(8000);
	}
	for (const k of ['A', 'B', 'C', 'D', 'E']) {
		const r = await step(`Seed DID ${k}`, () =>
			api('POST', '/did/create', {
				network: 'testnet',
				identifierFormatType: 'uuid',
				verificationMethodType: 'Ed25519VerificationKey2020',
			})
		);
		s.dids[k] = r.json?.did;
	}
	const eng = await engines(Object.values(s.dids));
	const allVeramo = Object.values(eng).every((e) => e === 'veramo');
	await step(
		'Seeded DIDs are recorded on Veramo',
		async () => ({ status: 200, json: eng, text: JSON.stringify(eng) }),
		{
			check: () => (allVeramo ? true : 'not all on Veramo: is the override on and the flag set?'),
		}
	);
	if (!allVeramo) return s;
	const { A, B, C, D, E } = s.dids;
	await sleep(3000);
	const k = await step('Seed key (Ed25519)', () => api('POST', '/key/create?type=Ed25519'));
	s.kid = k.json?.kid;
	await step('Seed schema resource on A', () =>
		api('POST', `/resource/create/${encodeURIComponent(A)}`, {
			name: 'leg-schema',
			type: 'JsonSchemaValidator2018',
			data: b64('{"type":"object"}'),
			encoding: 'base64',
		})
	);
	for (const [label, q, body] of [
		[
			'StatusList2021 revocation on C',
			'listType=StatusList2021&statusPurpose=revocation',
			{ did: C, statusListName: 'leg-rev' },
		],
		[
			'StatusList2021 suspension on C',
			'listType=StatusList2021&statusPurpose=suspension',
			{ did: C, statusListName: 'leg-sus' },
		],
		[
			'Bitstring (message) on C',
			'listType=BitstringStatusList&statusPurpose=message',
			{ did: C, statusListName: 'leg-bs', statusSize: 2, statusMessages: MSGS },
		],
		[
			'Bitstring accreditation list on A',
			'listType=BitstringStatusList&statusPurpose=message',
			{
				did: A,
				statusListName: 'leg-acc',
				credentialCategory: 'accreditation',
				statusSize: 2,
				statusMessages: MSGS,
			},
		],
	])
		await step(`Seed list: ${label}`, () => api('POST', `/credential-status/create/unencrypted?${q}`, body));
	await sleep(4000);
	const issue = (status) =>
		api('POST', '/credential/issue', {
			issuerDid: C,
			subjectDid: SUBJECT,
			format: 'jwt',
			attributes: { name: 'Legacy' },
			...(status ? { credentialStatus: status } : {}),
		});
	s.creds.rev = (
		await step('Seed credential with SL2021 revocation', () =>
			issue({ statusPurpose: 'revocation', statusListName: 'leg-rev', statusListType: 'StatusList2021' })
		)
	).json;
	s.creds.sus = (
		await step('Seed credential with SL2021 suspension', () =>
			issue({ statusPurpose: 'suspension', statusListName: 'leg-sus', statusListType: 'StatusList2021' })
		)
	).json;
	s.creds.bs = (
		await step('Seed credential with Bitstring status', () =>
			issue({ statusPurpose: 'message', statusListName: 'leg-bs', statusListType: 'BitstringStatusList' })
		)
	).json;
	s.creds.noFormat = (
		await step('Seed credential with no format', () =>
			api('POST', '/credential/issue', { issuerDid: C, subjectDid: SUBJECT, attributes: { name: 'Legacy' } })
		)
	).json;
	s.creds.jsonld = (
		await step('Seed JSON-LD credential with a custom context', () =>
			api('POST', '/credential/issue', {
				issuerDid: C,
				subjectDid: SUBJECT,
				format: 'jsonld',
				'@context': ['https://www.w3.org/2018/credentials/examples/v1'],
				type: ['UniversityDegreeCredential'],
				attributes: { degree: { type: 'BachelorDegree', name: 'Bachelor of Science' } },
			})
		)
	).json;
	s.root = url(A, 'leg-root', 'VerifiableAuthorizationForTrustChain');
	s.acc = url(A, 'leg-acc-b', 'VerifiableAccreditationToAccredit');
	s.att = url(B, 'leg-att-c', 'VerifiableAccreditationToAttest');
	await step('Seed authorise (A self)', () =>
		api('POST', '/trust-registry/accreditation/issue?accreditationType=authorize', {
			issuerDid: A,
			subjectDid: A,
			schemas: SCHEMAS,
			accreditationName: 'leg-root',
			format: 'jwt',
			...TRUST,
		})
	);
	await sleep(3000);
	await step('Seed accredit A->B with Bitstring status', () =>
		api('POST', '/trust-registry/accreditation/issue?accreditationType=accredit', {
			issuerDid: A,
			subjectDid: B,
			schemas: SCHEMAS,
			accreditationName: 'leg-acc-b',
			format: 'jwt',
			parentAccreditation: s.root,
			rootAuthorization: s.root,
			credentialStatus: {
				statusPurpose: 'message',
				statusListName: 'leg-acc',
				statusListType: 'BitstringStatusList',
			},
		})
	);
	await sleep(4000);
	await step('Seed attest B->C under the status-bearing parent', () =>
		api('POST', '/trust-registry/accreditation/issue?accreditationType=attest', {
			issuerDid: B,
			subjectDid: C,
			schemas: SCHEMAS,
			accreditationName: 'leg-att-c',
			format: 'jwt',
			parentAccreditation: s.acc,
			rootAuthorization: s.root,
		})
	);
	// E: a DID with history, for deactivation later
	for (let i = 1; i <= 3; i++) {
		await sleep(2500);
		await step(`Seed update ${i} on E`, () =>
			api('POST', '/did/update', {
				did: E,
				service: Array.from({ length: i }, (_, j) => ({
					id: `${E}#s${j}`,
					type: 'LinkedDomains',
					serviceEndpoint: [`https://example.org/${j}`],
				})),
			})
		);
	}
	await step('Seed resource on E', () =>
		api('POST', `/resource/create/${encodeURIComponent(E)}`, {
			name: 'leg-doc',
			type: 'TextDocument',
			data: b64('legacy'),
			encoding: 'base64',
		})
	);
	await step('Seed list on E', () =>
		api('POST', '/credential-status/create/unencrypted?listType=StatusList2021&statusPurpose=revocation', {
			did: E,
			statusListName: 'leg-e',
		})
	);
	void D;
	return s;
}

async function exercise(s) {
	const { A, B, C, D, E } = s.dids;
	const eng = await engines(Object.values(s.dids));
	await step('Seeded DIDs are still on Veramo', async () => ({ status: 200, json: eng, text: JSON.stringify(eng) }), {
		check: () => (Object.values(eng).every((e) => e === 'veramo') ? true : JSON.stringify(eng)),
	});
	const probe = await step('New DID goes to Credo (flag removed)', () =>
		api('POST', '/did/create', {
			network: 'testnet',
			identifierFormatType: 'uuid',
			verificationMethodType: 'Ed25519VerificationKey2020',
		})
	);
	const F = probe.json?.did;
	if (F) {
		const e = await engines([F]);
		await step('New DID recorded on Credo', async () => ({ status: 200, json: e, text: '' }), {
			check: () => (e[F] === 'credo' ? true : `engine ${e[F]}`),
		});
	}
	await sleep(3000);
	// DIDs and resources
	await step('DID update on an existing DID', () =>
		api('POST', '/did/update', {
			did: A,
			service: [{ id: `${A}#site`, type: 'LinkedDomains', serviceEndpoint: ['https://example.org'] }],
		})
	);
	await step('Resource create on an existing DID', () =>
		api('POST', `/resource/create/${encodeURIComponent(A)}`, {
			name: 'leg-schema',
			type: 'JsonSchemaValidator2018',
			data: b64('{"type":"object","required":[]}'),
			encoding: 'base64',
		})
	);
	if (s.kid) await step('Key read of a Veramo key', () => api('GET', `/key/read/${encodeURIComponent(s.kid)}`));
	// status lists
	await step(
		'New status list under an existing DID',
		() =>
			api('POST', '/credential-status/create/unencrypted?listType=StatusList2021&statusPurpose=revocation', {
				did: C,
				statusListName: 'leg-rev-2',
			}),
		{ known: 'U-48' }
	);
	await step(
		'New Bitstring list under an existing DID',
		() =>
			api('POST', '/credential-status/create/unencrypted?listType=BitstringStatusList&statusPurpose=message', {
				did: C,
				statusListName: 'leg-bs-2',
				statusSize: 2,
				statusMessages: MSGS,
			}),
		{ known: 'U-48' }
	);
	// issuing from existing DIDs on existing lists
	const fresh = await step('Issue from an existing DID on an existing list', () =>
		api('POST', '/credential/issue', {
			issuerDid: C,
			subjectDid: SUBJECT,
			format: 'jwt',
			attributes: { name: 'After' },
			credentialStatus: {
				statusPurpose: 'revocation',
				statusListName: 'leg-rev',
				statusListType: 'StatusList2021',
			},
		})
	);
	await step('Issue from an existing DID with no format', () =>
		api('POST', '/credential/issue', { issuerDid: C, subjectDid: SUBJECT, attributes: { name: 'After' } })
	);
	await step(
		'Issue JSON-LD from an existing DID with a custom context',
		() =>
			api('POST', '/credential/issue', {
				issuerDid: C,
				subjectDid: SUBJECT,
				format: 'jsonld',
				'@context': ['https://www.w3.org/2018/credentials/examples/v1'],
				type: ['UniversityDegreeCredential'],
				attributes: { degree: { type: 'BachelorDegree', name: 'Bachelor of Science' } },
			}),
		{ known: 'U-50' }
	);
	// verification of what customers already hold
	const verified = is((j) => j?.verified === true, 'not verified');
	for (const [k, label] of [
		['rev', 'SL2021 revocation'],
		['sus', 'SL2021 suspension'],
		['noFormat', 'no-format JWT'],
		['jsonld', 'JSON-LD'],
	])
		if (s.creds[k]?.proof)
			await step(
				`Verify existing ${label} credential`,
				() => api('POST', '/credential/verify', { credential: s.creds[k] }),
				{ check: verified }
			);
	if (s.creds.bs?.proof)
		await step(
			'Verify existing Bitstring credential with status',
			() => api('POST', '/credential/verify?verifyStatus=true', { credential: s.creds.bs }),
			{ check: verified }
		);
	if (fresh.json?.proof)
		await step(
			'Verify the new credential with status',
			() => api('POST', '/credential/verify?verifyStatus=true', { credential: fresh.json }),
			{ check: is((j) => j?.revoked === false, 'expected revoked false') }
		);
	// status changes on existing lists
	if (s.creds.rev?.proof) {
		await step('Revoke an existing credential', () =>
			api('POST', '/credential/revoke?listType=StatusList2021&publish=true', { credential: s.creds.rev })
		);
		await sleep(5000);
		await step(
			'Verify after revoke',
			() => api('POST', '/credential/verify?verifyStatus=true', { credential: s.creds.rev }),
			{ check: is((j) => j?.revoked === true, 'expected revoked true') }
		);
		const idx = Number(s.creds.rev.credentialStatus?.statusListIndex);
		await step(
			'Status check route on an existing list',
			() =>
				api('POST', '/credential-status/check?listType=StatusList2021&statusPurpose=revocation', {
					did: C,
					statusListName: 'leg-rev',
					index: idx,
				}),
			{ check: is((j) => j?.revoked === true, 'expected revoked true') }
		);
	}
	if (s.creds.sus?.proof) {
		await step('Suspend an existing credential', () =>
			api('POST', '/credential/suspend?listType=StatusList2021&publish=true', { credential: s.creds.sus })
		);
		await sleep(5000);
		await step('Reinstate an existing credential', () =>
			api('POST', '/credential/reinstate?listType=StatusList2021&publish=true', { credential: s.creds.sus })
		);
	}
	if (s.creds.bs?.proof)
		await step('Revoke an existing Bitstring credential', () =>
			api('POST', '/credential/revoke?listType=BitstringStatusList&publish=true', { credential: s.creds.bs })
		);
	// accreditation chain held today
	const chain = is((j) => j?.verified === true, 'chain not verified');
	await step(
		'Verify existing chain (attest under status-bearing parent)',
		() => api('POST', '/trust-registry/accreditation/verify', { didUrl: s.att, subjectDid: C }),
		{ check: chain }
	);
	await step(
		'Verify existing accreditation with status',
		() => api('POST', '/trust-registry/accreditation/verify?verifyStatus=true', { didUrl: s.acc, subjectDid: B }),
		{ check: chain }
	);
	await step('Existing DID B attests again under its existing parent', () =>
		api('POST', '/trust-registry/accreditation/issue?accreditationType=attest', {
			issuerDid: B,
			subjectDid: C,
			schemas: SCHEMAS,
			accreditationName: `leg-att-${Date.now().toString(36)}`,
			format: 'jwt',
			parentAccreditation: s.acc,
			rootAuthorization: s.root,
		})
	);
	if (F) {
		await step('Existing root accredits a new (Credo) DID', () =>
			api('POST', '/trust-registry/accreditation/issue?accreditationType=accredit', {
				issuerDid: A,
				subjectDid: F,
				schemas: SCHEMAS,
				accreditationName: 'leg-acc-f',
				format: 'jwt',
				parentAccreditation: s.root,
				rootAuthorization: s.root,
			})
		);
		await sleep(4000);
		await step('New (Credo) DID attests under an existing chain', () =>
			api('POST', '/trust-registry/accreditation/issue?accreditationType=attest', {
				issuerDid: F,
				subjectDid: C,
				schemas: SCHEMAS,
				accreditationName: 'leg-att-f',
				format: 'jwt',
				parentAccreditation: url(A, 'leg-acc-f', 'VerifiableAccreditationToAccredit'),
				rootAuthorization: s.root,
			})
		);
		await sleep(4000);
		await step(
			'Verify a chain that mixes engines',
			() =>
				api('POST', '/trust-registry/accreditation/verify', {
					didUrl: url(F, 'leg-att-f', 'VerifiableAccreditationToAttest'),
					subjectDid: C,
				}),
			{ check: chain }
		);
	}
	await step('Suspend existing accreditation', () =>
		api('POST', '/trust-registry/accreditation/suspend?publish=true', { didUrl: s.acc })
	);
	await sleep(4000);
	await step('Reinstate existing accreditation', () =>
		api('POST', '/trust-registry/accreditation/reinstate?publish=true', { didUrl: s.acc })
	);
	// export, deactivation
	await step(
		'Export an existing DID with an API key',
		() =>
			api('POST', `/did/export/${encodeURIComponent(D)}`, {
				password: crypto.randomBytes(12).toString('base64url'),
			}),
		{ known: 'U-63' }
	);
	await step('Deactivate an existing DID with history', () =>
		api('POST', `/did/deactivate/${encodeURIComponent(E)}`, {})
	);
	await step('Deactivate an existing DID', () => api('POST', `/did/deactivate/${encodeURIComponent(D)}`, {}));
}

console.log(`Legacy parity, phase ${phase}, against ${API}`);
if (phase === 'seed') {
	const s = await seed();
	fs.writeFileSync(STATE, JSON.stringify(s, null, 1), { mode: 0o600 });
} else {
	await exercise(JSON.parse(fs.readFileSync(STATE, 'utf8')));
}
const out = STATE.replace(/\.json$/, `-${phase}-results.json`);
fs.writeFileSync(out, JSON.stringify(steps, null, 1));
const count = (o) => steps.filter((x) => x.outcome === o).length;
console.log(
	`\nPASS ${count('PASS')}  KNOWN ${count('KNOWN')}  FIXED ${count('FIXED')}  FAIL ${count('FAIL')}\nDetails: ${out}`
);
process.exit(count('FAIL') ? 1 : 0);
