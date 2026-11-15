# Askar and unit tests

`@openwallet-foundation/askar-nodejs` registers FFI struct types (`ByteBuffer` and others) in a process-global
registry when it is first evaluated. Jest gives each test file a fresh module registry but reuses worker processes,
so a second test file in the same worker that evaluates the real package fails with
`Test suite failed to run: Duplicate type name 'ByteBuffer'`. Which suites fail varies from run to run, and each
passes when run alone.

## Rules

- Production code must not import `@openwallet-foundation/askar-nodejs` or `@credo-ts/askar` statically. Use
  `loadAskar()` from `src/services/identity/engine/credo/askar-native.ts`, which imports both on first call.
  `createCredoRuntime` calls it, so importing the engine, router, factory or a controller never loads the native module.
- `src/index.ts` awaits `loadAskar()` before the server listens, so a broken native module still stops the boot instead
  of failing the first Credo request.
- Unit tests must not load the real package. `tests/unit/identity/credo-engine/askar-lazy-load.test.ts` fails if an
  engine import evaluates it again.
- A test that genuinely needs the real native module (integration, contract) must run in its own Jest process
  (`--runInBand` with a single such file, or a separate invocation), never alongside other suites in a shared worker.
