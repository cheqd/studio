/**
 * Loads Askar's native bindings on demand. `@openwallet-foundation/askar-nodejs` registers FFI struct types in a
 * process-global registry when it is first evaluated, so it must not be evaluated by a plain `import` of the engine,
 * the router or a controller: a second evaluation in the same process (Jest reuses worker processes across test
 * files) throws "Duplicate type name 'ByteBuffer'". See `docs/testing-askar.md`.
 *
 * Production still fails fast: `src/index.ts` awaits `loadAskar()` before the server listens, so a broken native
 * module stops the boot rather than the first Credo request.
 */
export interface AskarBindings {
	AskarModule: typeof import('@credo-ts/askar').AskarModule;
	AskarMultiWalletDatabaseScheme: typeof import('@credo-ts/askar').AskarMultiWalletDatabaseScheme;
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
