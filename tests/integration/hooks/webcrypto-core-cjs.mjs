// Node module-customisation hook for the Credo engine integration test.
//
// `webcrypto-core` ships its ES build as `build/webcrypto-core.es.js` inside a package that is not
// `"type": "module"`. Plain Node reads it as an ES module, but tsx loads it as CommonJS and the named exports
// that @credo-ts/core needs (`CryptoKey`) come back undefined. Point it at the package's own CommonJS build,
// which both loaders read the same way. (The same fix as the `moduleNameMapper` entry in jest.config.cjs.)
export async function resolve(specifier, context, nextResolve) {
	if (specifier === 'webcrypto-core') {
		const resolved = await nextResolve('webcrypto-core/build/webcrypto-core.js', context).catch(() => null);
		if (resolved) return resolved;
		const url = new URL('../../../node_modules/webcrypto-core/build/webcrypto-core.js', import.meta.url).href;
		return { url, format: 'commonjs', shortCircuit: true };
	}
	return nextResolve(specifier, context);
}
