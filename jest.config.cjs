/** @type {import('ts-jest/dist/types').JestConfigWithTsJest} */
module.exports = {
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
		// `webcrypto-core` ships its ES build as `.es.js` inside a package that is not `"type": "module"`, so Jest
		// parses it as CommonJS and fails on `import`. The Credo fork (@credo-ts/core) pulls it in through the
		// `import` export condition; point it at the package's own CommonJS build instead.
		'^webcrypto-core$': '<rootDir>/node_modules/webcrypto-core/build/webcrypto-core.js',
	},
	extensionsToTreatAsEsm: ['.ts'],
	transform: {
		'^.+\\.(mt|t|cj|j)s$': [
			'ts-jest',
			{
				useESM: true,
			},
		],
	},
	testRegex: '/tests/unit/.*\\.test\\.ts$',
	collectCoverageFrom: ['src/**/*.{ts,js}'],
	moduleDirectories: ['node_modules', 'src'],
	testEnvironment: 'node',
	testTimeout: 10 * 1000, // 10s
	// Memory builds up in a worker across test files (module registries of the ESM suites); one worker reached the
	// 4 GB heap limit in CI and was killed. Restart any worker above 1 GB after a test file, and use at most two in CI.
	workerIdleMemoryLimit: '1GB',
	maxWorkers: process.env.CI ? 2 : '50%',
};
