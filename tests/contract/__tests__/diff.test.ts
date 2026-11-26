import { describe, it, expect } from '@jest/globals';
import { diffJson, formatDifferences } from '../lib/diff';

describe('diffJson', () => {
	it('returns nothing for equal documents', () => {
		expect(diffJson({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] })).toEqual([]);
	});

	it('reports changed, missing, extra and type differences with paths', () => {
		const d = diffJson({ a: 1, b: 'x', c: [1], d: 'y' }, { a: 2, c: [1, 2], d: 5, e: true });
		expect(d.map((x) => `${x.kind}:${x.path}`).sort()).toEqual(
			['changed:$.a', 'missing:$.b', 'extra:$.c[1]', 'type:$.d', 'extra:$.e'].sort()
		);
	});

	it('tolerates additions in additive mode but not removals or changes', () => {
		expect(diffJson({ a: 1 }, { a: 1, b: 2 }, 'additive')).toEqual([]);
		expect(diffJson({ a: [1] }, { a: [1, 2] }, 'additive')).toEqual([]);
		expect(diffJson({ a: 1, b: 2 }, { a: 1 }, 'additive')).toHaveLength(1);
		expect(diffJson({ a: 1 }, { a: 2 }, 'additive')).toHaveLength(1);
		expect(diffJson({ a: [1, 2] }, { a: [1] }, 'additive')).toHaveLength(1);
	});

	it('treats null and a missing value as different from a string', () => {
		expect(diffJson({ a: null }, { a: 'x' })[0].kind).toBe('type');
	});

	it('formats a bounded report', () => {
		const diffs = diffJson({ a: 1, b: 2, c: 3 }, { a: 0, b: 0, c: 0 });
		const text = formatDifferences(diffs, 2);
		expect(text).toContain('$.a');
		expect(text).toContain('and 1 more');
	});
});
