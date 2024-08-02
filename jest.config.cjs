/** @type {import('ts-jest/dist/types').JestConfigWithTsJest} */
module.exports = {
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
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
};
