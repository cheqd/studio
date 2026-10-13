// Node module-customisation hook for the faucet handler tests: replaces only `checkBalance` from @cheqd/sdk with a
// function the test supplies on globalThis, and re-exports everything else unchanged.
export async function resolve(specifier, context, nextResolve) {
	const resolved = await nextResolve(specifier, context);
	if (specifier === '@cheqd/sdk' && !context.parentURL?.startsWith('data:')) {
		const shim =
			`export * from ${JSON.stringify(resolved.url)};\n` +
			`export const checkBalance = (...args) => globalThis.__checkBalance(...args);\n`;
		return { url: 'data:text/javascript,' + encodeURIComponent(shim), format: 'module', shortCircuit: true };
	}
	return resolved;
}
