#!/usr/bin/env node
// Functional parity personas: each persona replays a usage pattern seen on Studio in production, against a Studio API
// (staging, testnet only), and records whether every step still does what it does on the released version.
//
// Usage:
//   STUDIO_API_URL=https://studio-api-staging.cheqd.net STUDIO_API_KEY_FILE=/path/to/key node tests/parity/run-personas.mjs [P1 P3 ...]
//
// The API key is read from a file and never printed. Results go to tests/parity/results/<timestamp>.json and a Markdown
// summary is printed. A step marked `known` is expected to fail because of a recorded defect; it is reported as KNOWN
// while it fails and as FIXED once it passes. Anything else that fails is reported as FAIL.
//
// The personas contain no customer data: they are journeys (operation types, order, options and formats), not records.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const API = process.env.STUDIO_API_URL || 'https://studio-api-staging.cheqd.net';
if (/studio-api\.cheqd\.net/.test(API) && !process.env.PARITY_ALLOW_PRODUCTION) {
	console.error('Refusing to run against the production API. Use staging.');
	process.exit(2);
}
const KEY_FILE = process.env.STUDIO_API_KEY_FILE;
if (!KEY_FILE) {
	console.error('Set STUDIO_API_KEY_FILE to a file holding an API key for a test account on the target environment.');
	process.exit(2);
}
const KEY = fs.readFileSync(KEY_FILE, 'utf8').trim();
const NETWORK = 'testnet';
const SUBJECT_DID_KEY = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (s) => Buffer.from(s).toString('base64');
const run = `${Date.now().toString(36)}`;
const name = (s) => `parity-${run}-${s}`;

async function api(method, route, body) {
	const headers = { 'x-api-key': KEY, Accept: 'application/json' };
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	if (method !== 'GET') headers['Idempotency-Key'] = crypto.randomUUID();
	let status = 0;
	let text = '';
	try {
		const r = await fetch(API + route, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		status = r.status;
		text = await r.text();
	} catch (e) {
		text = String(e);
	}
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = undefined;
	}
	return { status, json, text };
}

const results = [];
let current;

/**
 * One step. `check(res)` returns true, or a string saying why the step failed. Default: 2xx and no `error` field.
 * `known`: the recorded defect id (for example 'U-53') when this step is expected to fail today.
 */
async function step(label, call, { check, known, note, rejection } = {}) {
	const res = await call();
	// `rejection`: the step expects a 4xx refusal, and `check` decides whether it is the right one
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
	const reason = ok ? '' : `${verdict}${res.json?.error ? `: ${String(res.json.error).slice(0, 220)}` : ''}`;
	current.steps.push({ step: label, outcome, known: known || '', status: res.status, reason, note: note || '' });
	console.log(`  ${outcome.padEnd(5)} ${label}${reason ? `  (${reason})` : ''}`);
	return res;
}

const has = (res, f) => (f(res.json) ? true : `unexpected body: ${res.text.slice(0, 160)}`);

// ---------- building blocks ----------
async function createDid(label, extra = {}) {
	const r = await step(`DID create (${label})`, () =>
		api('POST', '/did/create', {
			network: NETWORK,
			identifierFormatType: 'uuid',
			verificationMethodType: 'Ed25519VerificationKey2020',
			...extra,
		})
	);
	return r.json?.did;
}
const didUrl = (did, n, t) => `${did}?resourceName=${n}&resourceType=${t}`;
const STATUS_MESSAGES = [
	{ status: '0x0', message: 'valid' },
	{ status: '0x1', message: 'revoked' },
	{ status: '0x2', message: 'suspended' },
	{ status: '0x3', message: 'unknown' },
];
const SCHEMAS = [{ types: ['VerifiableCredential', 'ParityTestCredential'], url: 'https://schema.org/Person' }];
const TRUST = { trustFramework: 'https://learn.cheqd.io/governance/start', trustFrameworkId: 'parity trust framework' };
// A 1x1 JPEG, for the binary resource case
const TINY_JPEG =
	'/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

// ---------- personas ----------
const PERSONAS = {
	P1: {
		title: 'Trust-chain builder (accreditation schemes)',
		basedOn: 'R1, R3, A02',
		async run() {
			const A = await createDid('root TAO');
			const B = await createDid('TAO');
			const C = await createDid('trusted issuer');
			if (!A || !B || !C) return;
			await sleep(3000);
			const schema = {
				$schema: 'http://json-schema.org/draft-07/schema#',
				type: 'object',
				properties: { name: { type: 'string' } },
			};
			await step('Resource create: JSON schema', () =>
				api('POST', `/resource/create/${encodeURIComponent(A)}`, {
					name: name('schema'),
					type: 'JsonSchemaValidator2018',
					data: b64(JSON.stringify(schema)),
					encoding: 'base64',
				})
			);
			await step('Resource create: new version of the same schema', () =>
				api('POST', `/resource/create/${encodeURIComponent(A)}`, {
					name: name('schema'),
					type: 'JsonSchemaValidator2018',
					data: b64(JSON.stringify({ ...schema, required: ['name'] })),
					encoding: 'base64',
				})
			);
			await step('Resource create: image (binary)', () =>
				api('POST', `/resource/create/${encodeURIComponent(A)}`, {
					name: name('logo'),
					type: 'Diploma',
					data: TINY_JPEG,
					encoding: 'base64',
				})
			);
			await step('Status list create: Bitstring, accreditation category, message purpose', () =>
				api(
					'POST',
					'/credential-status/create/unencrypted?listType=BitstringStatusList&statusPurpose=message',
					{
						did: A,
						statusListName: name('acc'),
						credentialCategory: 'accreditation',
						statusSize: 2,
						statusMessages: STATUS_MESSAGES,
					}
				)
			);
			await sleep(3000);
			const root = didUrl(A, name('root'), 'VerifiableAuthorizationForTrustChain');
			await step('Accreditation: authorise (self-issued root)', () =>
				api('POST', '/trust-registry/accreditation/issue?accreditationType=authorize', {
					issuerDid: A,
					subjectDid: A,
					schemas: SCHEMAS,
					accreditationName: name('root'),
					format: 'jwt',
					...TRUST,
				})
			);
			await sleep(3000);
			const accPlain = didUrl(A, name('acc-plain'), 'VerifiableAccreditationToAccredit');
			await step('Accreditation: accredit without status', () =>
				api('POST', '/trust-registry/accreditation/issue?accreditationType=accredit', {
					issuerDid: A,
					subjectDid: B,
					schemas: SCHEMAS,
					accreditationName: name('acc-plain'),
					format: 'jwt',
					parentAccreditation: root,
					rootAuthorization: root,
				})
			);
			const accStatus = didUrl(A, name('acc-status'), 'VerifiableAccreditationToAccredit');
			await step('Accreditation: accredit with Bitstring status', () =>
				api('POST', '/trust-registry/accreditation/issue?accreditationType=accredit', {
					issuerDid: A,
					subjectDid: B,
					schemas: SCHEMAS,
					accreditationName: name('acc-status'),
					format: 'jwt',
					parentAccreditation: root,
					rootAuthorization: root,
					credentialStatus: {
						statusPurpose: 'message',
						statusListName: name('acc'),
						statusListType: 'BitstringStatusList',
					},
				})
			);
			await sleep(4000);
			const att = didUrl(B, name('att'), 'VerifiableAccreditationToAttest');
			await step('Accreditation: attest under the parent without status', () =>
				api('POST', '/trust-registry/accreditation/issue?accreditationType=attest', {
					issuerDid: B,
					subjectDid: C,
					schemas: SCHEMAS,
					accreditationName: name('att'),
					format: 'jwt',
					parentAccreditation: accPlain,
					rootAuthorization: root,
				})
			);
			await step(
				'Accreditation: attest under the parent with status',
				() =>
					api('POST', '/trust-registry/accreditation/issue?accreditationType=attest', {
						issuerDid: B,
						subjectDid: C,
						schemas: SCHEMAS,
						accreditationName: name('att2'),
						format: 'jwt',
						parentAccreditation: accStatus,
						rootAuthorization: root,
					}),
				{ known: 'U-53' }
			);
			await sleep(4000);
			const verified = (res) => has(res, (j) => j?.verified === true);
			await step(
				'Accreditation verify: full chain by DID URL',
				() => api('POST', '/trust-registry/accreditation/verify', { didUrl: att, subjectDid: C }),
				{ check: verified }
			);
			await step(
				'Accreditation verify: by DID, name and type',
				() =>
					api('POST', '/trust-registry/accreditation/verify', {
						did: B,
						resourceName: name('att'),
						resourceType: 'VerifiableAccreditationToAttest',
						subjectDid: C,
					}),
				{ check: verified }
			);
			await step(
				'Accreditation verify: schema filter',
				() =>
					api('POST', '/trust-registry/accreditation/verify', {
						didUrl: att,
						subjectDid: C,
						schemas: SCHEMAS,
					}),
				{ check: verified }
			);
			await step(
				'Accreditation verify: wrong subject is rejected',
				() => api('POST', '/trust-registry/accreditation/verify', { didUrl: att, subjectDid: A }),
				{ rejection: true, check: (r) => (r.json?.verified === false ? true : 'accepted a wrong subject') }
			);
			await step(
				'Accreditation verify with status',
				() =>
					api('POST', '/trust-registry/accreditation/verify?verifyStatus=true', {
						didUrl: accStatus,
						subjectDid: B,
					}),
				{ check: verified, known: 'U-53' }
			);
			await step('Accreditation suspend', () =>
				api('POST', '/trust-registry/accreditation/suspend?publish=true', { didUrl: accStatus })
			);
			await sleep(4000);
			await step('Accreditation reinstate', () =>
				api('POST', '/trust-registry/accreditation/reinstate?publish=true', { didUrl: accStatus })
			);
			await sleep(4000);
			await step('Accreditation revoke', () =>
				api('POST', '/trust-registry/accreditation/revoke?publish=true', { didUrl: accStatus })
			);
			await step('Accreditation list', () =>
				api('GET', `/trust-registry/accreditation/list?accreditationType=accredit&network=${NETWORK}`)
			);
			const offer = await step('Credential issue to a holder DID the account owns (offer)', () =>
				api('POST', '/credential/issue', {
					issuerDid: A,
					subjectDid: C,
					format: 'jwt',
					attributes: { name: 'Parity' },
					type: ['ParityTestCredential'],
				})
			);
			if (offer.json?.proof)
				await step(
					'Credential verify (JWT)',
					() => api('POST', '/credential/verify', { credential: offer.json }),
					{ check: verified }
				);
			await step('DID deactivate: DID with little history', () =>
				api('POST', `/did/deactivate/${encodeURIComponent(C)}`, {})
			);
			await step(
				'DID deactivate: DID with versions, resources and lists',
				() => api('POST', `/did/deactivate/${encodeURIComponent(A)}`, {}),
				{ note: 'U-62 seen on a DID with several updates; resources alone do not trigger it' }
			);
		},
	},

	P2: {
		title: 'DID automation script (create then update in bulk)',
		basedOn: 'R2',
		async run() {
			let last;
			for (let i = 1; i <= 3; i++) {
				const did = await createDid(`batch ${i}`);
				if (!did) return;
				last = did;
				await sleep(2500);
				await step(`DID update ${i}a: add service`, () =>
					api('POST', '/did/update', {
						did,
						service: [
							{ id: `${did}#service-1`, type: 'LinkedDomains', serviceEndpoint: ['https://example.org'] },
						],
					})
				);
				await sleep(2500);
				await step(`DID update ${i}b: replace service`, () =>
					api('POST', '/did/update', {
						did,
						service: [
							{ id: `${did}#service-1`, type: 'LinkedDomains', serviceEndpoint: ['https://example.com'] },
						],
					})
				);
				await sleep(2500);
			}
			await step('DID list', () => api('GET', `/did/list?network=${NETWORK}`));
			if (last)
				await step('DID deactivate after two updates', () =>
					api('POST', `/did/deactivate/${encodeURIComponent(last)}`, {})
				);
		},
	},

	P3: {
		title: 'StatusList2021 issuer (revocation and suspension)',
		basedOn: 'R4, R7',
		async run(shared) {
			const key = await step('Key create (Ed25519)', () => api('POST', '/key/create?type=Ed25519'));
			const kid = key.json?.kid;
			const did = await createDid('with the key just created', kid ? { key: kid } : {});
			if (!did) return;
			await sleep(3000);
			await step('Resource create: HTML text document', () =>
				api('POST', `/resource/create/${encodeURIComponent(did)}`, {
					name: name('page'),
					type: 'TextDocument',
					data: b64('<html><body>parity</body></html>'),
					encoding: 'base64',
				})
			);
			await step('Status list create: StatusList2021 revocation', () =>
				api('POST', '/credential-status/create/unencrypted?listType=StatusList2021&statusPurpose=revocation', {
					did,
					statusListName: name('rev'),
				})
			);
			await step('Status list create: StatusList2021 suspension', () =>
				api('POST', '/credential-status/create/unencrypted?listType=StatusList2021&statusPurpose=suspension', {
					did,
					statusListName: name('sus'),
				})
			);
			await sleep(3000);
			const issue = (purpose, list) =>
				api('POST', '/credential/issue', {
					issuerDid: did,
					subjectDid: SUBJECT_DID_KEY,
					format: 'jwt',
					attributes: { name: 'Parity' },
					credentialStatus: {
						statusPurpose: purpose,
						statusListName: list,
						statusListType: 'StatusList2021',
					},
				});
			const rev = await step('Credential issue with revocation status', () => issue('revocation', name('rev')));
			const idx = Number(rev.json?.credentialStatus?.statusListIndex);
			if (rev.json?.proof)
				shared.toVerify.push([
					'Verify a StatusList2021 credential issued by another account (revoked by the end)',
					rev.json,
					{ q: '?verifyStatus=true' },
				]);
			await step(
				'Credential verify with status (not revoked)',
				() => api('POST', '/credential/verify?verifyStatus=true', { credential: rev.json }),
				{ check: (r) => has(r, (j) => j?.verified === true && j?.revoked === false) }
			);
			await step(
				'Status check route (not revoked)',
				() =>
					api('POST', '/credential-status/check?listType=StatusList2021&statusPurpose=revocation', {
						did,
						statusListName: name('rev'),
						index: idx,
					}),
				{ check: (r) => has(r, (j) => j?.revoked === false) }
			);
			await step('Credential revoke', () =>
				api('POST', '/credential/revoke?listType=StatusList2021&publish=true', { credential: rev.json })
			);
			await sleep(5000);
			await step(
				'Credential verify with status (revoked)',
				() => api('POST', '/credential/verify?verifyStatus=true', { credential: rev.json }),
				{ check: (r) => has(r, (j) => j?.revoked === true) }
			);
			await step(
				'Status check route (revoked)',
				() =>
					api('POST', '/credential-status/check?listType=StatusList2021&statusPurpose=revocation', {
						did,
						statusListName: name('rev'),
						index: idx,
					}),
				{ check: (r) => has(r, (j) => j?.revoked === true) }
			);
			const sus = await step('Credential issue with suspension status', () => issue('suspension', name('sus')));
			await step('Credential suspend', () =>
				api('POST', '/credential/suspend?listType=StatusList2021&publish=true', { credential: sus.json })
			);
			await sleep(5000);
			await step(
				'Credential verify (suspended)',
				() => api('POST', '/credential/verify?verifyStatus=true', { credential: sus.json }),
				{ check: (r) => has(r, (j) => j?.suspended === true) }
			);
			await step('Credential reinstate', () =>
				api('POST', '/credential/reinstate?listType=StatusList2021&publish=true', { credential: sus.json })
			);
			await sleep(5000);
			await step(
				'Credential verify (reinstated)',
				() => api('POST', '/credential/verify?verifyStatus=true', { credential: sus.json }),
				{ check: (r) => has(r, (j) => j?.suspended === false) }
			);
			await step(
				'Credential issue with no format (documented default VC-JWT)',
				() =>
					api('POST', '/credential/issue', {
						issuerDid: did,
						subjectDid: SUBJECT_DID_KEY,
						attributes: { name: 'Parity' },
					}),
				{ known: 'U-49' }
			);
			await step(
				'Credential issue JSON-LD with a custom context',
				() =>
					api('POST', '/credential/issue', {
						issuerDid: did,
						subjectDid: SUBJECT_DID_KEY,
						format: 'jsonld',
						'@context': ['https://www.w3.org/2018/credentials/examples/v1'],
						type: ['UniversityDegreeCredential'],
						attributes: { degree: { type: 'BachelorDegree', name: 'Bachelor of Science' } },
					}),
				{ known: 'U-50' }
			);
			await step('DID update', () =>
				api('POST', '/did/update', {
					did,
					service: [{ id: `${did}#site`, type: 'LinkedDomains', serviceEndpoint: ['https://example.org'] }],
				})
			);
			await step('Issued credentials list', () =>
				api('GET', `/credentials/issued?issuerId=${encodeURIComponent(did)}`)
			);
			// Reproduces U-62: a DID with several updates and a growing document, plus resources and list versions
			await sleep(2500);
			const resolved = await step('DID resolve', () => api('GET', `/did/search/${encodeURIComponent(did)}`));
			const doc = resolved.json?.didDocument;
			if (doc) {
				doc.service = [
					...(doc.service || []),
					{ id: `${did}#docs`, type: 'LinkedDomains', serviceEndpoint: ['https://docs.example.org'] },
				];
				await step('DID update: full document', () => api('POST', '/did/update', { didDocument: doc }));
				await sleep(2500);
				await step('DID update: replace a service', () =>
					api('POST', '/did/update', {
						did,
						service: [
							{ id: `${did}#site`, type: 'LinkedDomains', serviceEndpoint: ['https://example.com'] },
						],
					})
				);
				await sleep(2500);
			}
			await step(
				'DID deactivate: DID with several updates, resources and list versions',
				() => api('POST', `/did/deactivate/${encodeURIComponent(did)}`, {}),
				{ known: 'U-62' }
			);
		},
	},

	P4: {
		title: 'Bitstring credential issuer',
		basedOn: 'R5, A02, R6 (its list)',
		async run(shared) {
			const did = await createDid('issuer');
			if (!did) return;
			await sleep(3000);
			await step('Status list create: Bitstring, credential category, message purpose', () =>
				api(
					'POST',
					'/credential-status/create/unencrypted?listType=BitstringStatusList&statusPurpose=message',
					{ did, statusListName: name('bs'), statusSize: 2, statusMessages: STATUS_MESSAGES }
				)
			);
			await sleep(3000);
			const cred = await step('Credential issue with Bitstring status', () =>
				api('POST', '/credential/issue', {
					issuerDid: did,
					subjectDid: SUBJECT_DID_KEY,
					format: 'jwt',
					attributes: { name: 'Parity' },
					credentialStatus: {
						statusPurpose: 'message',
						statusListName: name('bs'),
						statusListType: 'BitstringStatusList',
					},
				})
			);
			if (cred.json?.proof)
				shared.toVerify.push([
					'Verify a Bitstring-status credential issued by another account',
					cred.json,
					{ q: '?verifyStatus=true', known: 'U-53' },
				]);
			await step('Resource create: VerifiableCredential', () =>
				api('POST', `/resource/create/${encodeURIComponent(did)}`, {
					name: name('vc'),
					type: 'VerifiableCredential',
					data: b64(JSON.stringify(cred.json || {})),
					encoding: 'base64',
				})
			);
			await step(
				'Credential verify without status',
				() => api('POST', '/credential/verify', { credential: cred.json }),
				{ check: (r) => has(r, (j) => j?.verified === true) }
			);
			await step(
				'Credential verify with Bitstring status',
				() => api('POST', '/credential/verify?verifyStatus=true', { credential: cred.json }),
				{ known: 'U-53' }
			);
			const cs = cred.json?.credentialStatus || {};
			await step(
				'Status check route (Bitstring)',
				() =>
					api('POST', '/credential-status/check?listType=BitstringStatusList&statusPurpose=message', {
						did,
						statusListName: name('bs'),
						statusListCredential: cs.statusListCredential,
						index: Number(cs.statusListIndex),
						statusSize: 2,
						statusMessage: STATUS_MESSAGES,
					}),
				{ note: 'route shape from swagger' }
			);
			await step('Credential revoke (Bitstring)', () =>
				api('POST', '/credential/revoke?listType=BitstringStatusList&publish=true', { credential: cred.json })
			);
		},
	},

	P5: {
		title: 'Verifier of credentials issued elsewhere',
		basedOn: 'R6, A03',
		needs: ['P3', 'P4'],
		async run(shared) {
			if (!shared.toVerify.length)
				console.log('  (run P3 and P4 first in the same invocation to give the verifier something to check)');
			for (const [label, cred, opts] of shared.toVerify)
				await step(label, () => api('POST', `/credential/verify${opts.q || ''}`, { credential: cred }), {
					known: opts.known,
				});
			const tampered = shared.toVerify[0]?.[1]?.proof?.jwt;
			if (tampered) {
				const [h, p, sig] = tampered.split('.');
				const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
				payload.vc.credentialSubject.name = 'Tampered';
				const forged = [h, Buffer.from(JSON.stringify(payload)).toString('base64url'), sig].join('.');
				await step(
					'A tampered credential is rejected',
					() => api('POST', '/credential/verify', { credential: forged }),
					{
						rejection: true,
						check: (r) => (r.json?.verified === true ? 'a tampered credential verified' : true),
					}
				);
			}
		},
	},

	P6: {
		title: 'Key and DID portability (import and export)',
		basedOn: 'R8',
		async run() {
			const did = await createDid('to export later');
			if (!did) return;
			await step('Key create (Ed25519)', () => api('POST', '/key/create?type=Ed25519'));
			await step(
				'Key import (Ed25519)',
				() =>
					api('POST', '/key/import', {
						type: 'Ed25519',
						privateKeyHex: crypto.randomBytes(32).toString('hex'),
						alias: name('imported'),
						encrypted: false,
					}),
				{ known: 'U-51' }
			);
			await step(
				'DID import',
				() =>
					api('POST', '/did/import', {
						did,
						keys: [
							{
								type: 'Ed25519',
								privateKeyHex: crypto.randomBytes(32).toString('hex'),
								encrypted: false,
							},
						],
					}),
				{ known: 'U-51' }
			);
			await step(
				'DID export (password protected)',
				() =>
					api('POST', `/did/export/${encodeURIComponent(did)}`, {
						password: crypto.randomBytes(12).toString('base64url'),
					}),
				{ known: 'U-63 (API keys cannot export since A-058); U-52 for Credo DIDs' }
			);
			await step('Credential issue (JWT)', () =>
				api('POST', '/credential/issue', {
					issuerDid: did,
					subjectDid: SUBJECT_DID_KEY,
					format: 'jwt',
					attributes: { name: 'Parity' },
				})
			);
		},
	},

	P7: {
		title: 'Issue-and-offer trial (issue to own DID, accept, verify)',
		basedOn: 'A01',
		async run() {
			const issuer = await createDid('issuer');
			const holder = await createDid('holder');
			if (!issuer || !holder) return;
			await sleep(3000);
			const cred = await step('Credential issue to own DID (creates an offer)', () =>
				api('POST', '/credential/issue', {
					issuerDid: issuer,
					subjectDid: holder,
					format: 'jwt',
					attributes: { name: 'Parity' },
				})
			);
			const offers = await step(
				'Offers list for the holder',
				() => api('GET', `/credentials/offers?holderDid=${encodeURIComponent(holder)}`),
				{ check: (r) => has(r, (j) => (j?.offers?.length ?? 0) > 0) }
			);
			const offerId = offers.json?.offers?.[0]?.issuedCredentialId;
			if (offerId) {
				await step('Offer accept', () =>
					api('POST', `/credentials/offers/${encodeURIComponent(offerId)}/accept`, { holderDid: holder })
				);
				await step('Received credentials list', () =>
					api('GET', `/credentials/received?holderDid=${encodeURIComponent(holder)}`)
				);
			}
			if (cred.json?.proof)
				await step('Credential verify', () => api('POST', '/credential/verify', { credential: cred.json }), {
					check: (r) => has(r, (j) => j?.verified === true),
				});
		},
	},

	P8: {
		title: 'Key-only trial',
		basedOn: 'A04, A07',
		async run() {
			for (const type of ['Ed25519', 'Secp256k1']) {
				const k = await step(`Key create (${type})`, () => api('POST', `/key/create?type=${type}`));
				if (k.json?.kid) {
					await step(`Key read (${type})`, () => api('GET', `/key/read/${encodeURIComponent(k.json.kid)}`));
					await step(`Key metadata present (${type})`, async () => k, {
						check: (r) => (r.json?.meta ? true : 'meta is null'),
						known: type === 'Secp256k1' ? 'cosmetic: key meta null on Credo' : '',
					});
				}
			}
		},
	},
};

// ---------- main ----------
const wanted = process.argv.slice(2).filter((a) => PERSONAS[a]);
const order = wanted.length ? wanted : Object.keys(PERSONAS);
const shared = { toVerify: [] };
const startedAt = new Date().toISOString();
console.log(`Parity personas against ${API} (run ${run})`);
const bal = await api('GET', '/account/balances');
const cheq = Number(bal.json?.testnet?.balance?.cheq ?? 0);
console.log(`Testnet balance: ${cheq} CHEQ`);
if (cheq < 90000) {
	const f = await api('POST', '/account/faucet', { amount: Math.min(100000, Math.ceil(100000 - cheq)) });
	console.log(`Faucet top-up: HTTP ${f.status}`);
	await sleep(8000);
}
for (const id of order) {
	const p = PERSONAS[id];
	current = { id, title: p.title, basedOn: p.basedOn, steps: [] };
	results.push(current);
	console.log(`\n${id} ${p.title} (based on ${p.basedOn})`);
	await p.run(shared);
}
const summary = results.map((r) => ({
	id: r.id,
	title: r.title,
	pass: r.steps.filter((s) => s.outcome === 'PASS').length,
	known: r.steps.filter((s) => s.outcome === 'KNOWN').length,
	fixed: r.steps.filter((s) => s.outcome === 'FIXED').length,
	fail: r.steps.filter((s) => s.outcome === 'FAIL').length,
}));
const outDir = path.join(path.dirname(new URL(import.meta.url).pathname), 'results');
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `${startedAt.replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(
	file,
	JSON.stringify({ api: API, run, startedAt, finishedAt: new Date().toISOString(), summary, results }, null, 1)
);
console.log('\n| Persona | Pass | Known defect | Fixed | Unexpected fail |\n| --- | --- | --- | --- | --- |');
for (const s of summary) console.log(`| ${s.id} ${s.title} | ${s.pass} | ${s.known} | ${s.fixed} | ${s.fail} |`);
console.log(`\nDetails: ${file}`);
process.exit(summary.some((s) => s.fail) ? 1 : 0);
