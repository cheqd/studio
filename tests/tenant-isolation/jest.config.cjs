/**
 * Jest config for the tenant isolation suite (gate T2, risk R-012).
 * Kept apart from the unit config so `npm run test:unit` stays hermetic and database-free.
 * Run with: npm run test:isolation  (see tests/tenant-isolation/README.md)
 */
const base = require('../../jest.config.cjs');

module.exports = {
	...base,
	rootDir: '../..',
	testRegex: '/tests/tenant-isolation/.*\\.test\\.ts$',
	setupFiles: ['<rootDir>/tests/tenant-isolation/harness/setup-env.ts'],
	testTimeout: 60 * 1000,
	// One shared database and one in-process app: run files serially.
	maxWorkers: 1,
};
