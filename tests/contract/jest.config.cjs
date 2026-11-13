/** Contract suite runner. Kept separate from the unit config, whose testRegex only matches tests/unit. */
const base = require('../../jest.config.cjs');

module.exports = {
	...base,
	rootDir: '../..',
	testRegex: '/tests/contract/.*\\.test\\.ts$',
	testTimeout: 30 * 60 * 1000,
};
