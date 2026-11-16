import type { Json } from './normaliser.js';

export type DiffKind = 'changed' | 'missing' | 'extra' | 'type';

export interface Difference {
	path: string;
	kind: DiffKind;
	expected?: Json;
	actual?: Json;
}

/**
 * `strict`: any difference fails, including fields the fixture does not have.
 * `additive`: extra fields in the actual response are tolerated (a new optional field is
 * backward compatible); missing, changed and re-typed fields still fail.
 */
export type DiffMode = 'strict' | 'additive';

function kindOf(v: Json | undefined): string {
	if (v === null || v === undefined) return 'null';
	return Array.isArray(v) ? 'array' : typeof v;
}

export function diffJson(expected: Json, actual: Json, mode: DiffMode = 'strict', path = '$'): Difference[] {
	const ke = kindOf(expected);
	const ka = kindOf(actual);
	if (ke !== ka) return [{ path, kind: 'type', expected, actual }];

	if (ke === 'array') {
		const e = expected as Json[];
		const a = actual as Json[];
		const out: Difference[] = [];
		for (let i = 0; i < Math.max(e.length, a.length); i++) {
			if (i >= a.length) out.push({ path: `${path}[${i}]`, kind: 'missing', expected: e[i] });
			else if (i >= e.length) {
				if (mode === 'strict') out.push({ path: `${path}[${i}]`, kind: 'extra', actual: a[i] });
			} else out.push(...diffJson(e[i], a[i], mode, `${path}[${i}]`));
		}
		return out;
	}

	if (ke === 'object') {
		const e = expected as { [k: string]: Json };
		const a = actual as { [k: string]: Json };
		const out: Difference[] = [];
		for (const k of Object.keys(e)) {
			if (!(k in a)) out.push({ path: `${path}.${k}`, kind: 'missing', expected: e[k] });
			else out.push(...diffJson(e[k], a[k], mode, `${path}.${k}`));
		}
		if (mode === 'strict') {
			for (const k of Object.keys(a))
				if (!(k in e)) out.push({ path: `${path}.${k}`, kind: 'extra', actual: a[k] });
		}
		return out;
	}

	return expected === actual ? [] : [{ path, kind: 'changed', expected, actual }];
}

export function formatDifferences(diffs: Difference[], limit = 20): string {
	const lines = diffs.slice(0, limit).map((d) => {
		const e = d.expected === undefined ? '' : ` expected ${JSON.stringify(d.expected)}`;
		const a = d.actual === undefined ? '' : ` actual ${JSON.stringify(d.actual)}`;
		return `  ${d.kind.padEnd(7)} ${d.path}${e}${a}`;
	});
	if (diffs.length > limit) lines.push(`  ... and ${diffs.length - limit} more`);
	return lines.join('\n');
}
