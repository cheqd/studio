/**
 * Loads Askar's native bindings on demand. `@openwallet-foundation/askar-nodejs` registers FFI struct types in a
 * process-global registry when it is first evaluated, so it must not be evaluated by a plain `import` of the engine,
 * the router or a controller: a second evaluation in the same process (Jest reuses worker processes across test
 * files) throws "Duplicate type name 'ByteBuffer'". See `docs/testing-askar.md`.
 *
 * Production still fails fast: `src/index.ts` awaits `verifyAskarNative()` before the server listens, so a broken
 * native module stops the boot rather than the first Credo request. Importing the package is not enough: the native
 * library is only opened at first use, so the check calls into it.
 */
export interface AskarBindings {
	AskarModule: typeof import('@credo-ts/askar').AskarModule;
	AskarMultiWalletDatabaseScheme: typeof import('@credo-ts/askar').AskarMultiWalletDatabaseScheme;
	askar: typeof import('@openwallet-foundation/askar-nodejs').askar;
	KdfMethod: typeof import('@openwallet-foundation/askar-nodejs').KdfMethod;
	NativeAskar: typeof import('@openwallet-foundation/askar-nodejs').NativeAskar;
	Store: typeof import('@openwallet-foundation/askar-nodejs').Store;
	StoreKeyMethod: typeof import('@openwallet-foundation/askar-nodejs').StoreKeyMethod;
}

let loaded: Promise<AskarBindings> | undefined;

export function loadAskar(): Promise<AskarBindings> {
	loaded ??= Promise.all([import('@credo-ts/askar'), import('@openwallet-foundation/askar-nodejs')]).then(
		([credo, native]) => ({
			AskarModule: credo.AskarModule,
			AskarMultiWalletDatabaseScheme: credo.AskarMultiWalletDatabaseScheme,
			askar: native.askar,
			KdfMethod: native.KdfMethod,
			NativeAskar: native.NativeAskar,
			Store: native.Store,
			StoreKeyMethod: native.StoreKeyMethod,
		}),
		(error) => {
			// Do not cache a failure
			loaded = undefined;
			throw error;
		}
	);
	return loaded;
}

export type AskarProbe = () => Promise<string>;

/** Opens the native library with its cheapest call, the version query, and returns the version. Throws if it cannot. */
export const probeAskarNative: AskarProbe = async () => (await loadAskar()).askar.version();

export type AskarCheckResult = { ok: true; version: string } | { ok: false; reason: string };

/**
 * Start-up check that the Askar native library is present and callable. Never throws: the one-line reason names
 * `LIB_ASKAR_PATH`, which is the first thing to check. The probe is injectable so unit tests never load the library.
 */
export async function verifyAskarNative(probe: AskarProbe = probeAskarNative): Promise<AskarCheckResult> {
	try {
		return { ok: true, version: await probe() };
	} catch (error) {
		const detail = (error instanceof Error ? error.message : String(error)).split('\n')[0].trim();
		return {
			ok: false,
			reason: `Askar native library is missing or incompatible: check LIB_ASKAR_PATH first (${detail})`,
		};
	}
}

/** The start-up gate: on failure writes the reason and stops the process, so the server never listens. */
export async function enforceAskarNative(
	options: { probe?: AskarProbe; log?: (line: string) => void; exit?: (code: number) => never | void } = {}
): Promise<void> {
	const result = await verifyAskarNative(options.probe);
	if (result.ok) return;
	(options.log ?? console.error)(result.reason);
	(options.exit ?? process.exit)(1);
}
