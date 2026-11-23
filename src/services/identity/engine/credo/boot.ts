import { startCredoRuntime } from './factory.js';

/** Any of these set means Credo's storage is meant to be configured, so the boot opens it (U-68). */
export const CREDO_STORAGE_VARIABLES = ['CREDO_DB_USER', 'CREDO_DB_PASSWORD', 'CREDO_STORE_KEY'] as const;

export interface EnforceCredoRuntimeOptions {
	env?: Record<string, string | undefined>;
	start?: () => Promise<void>;
	log?: (line: string) => void;
	error?: (line: string) => void;
	exit?: (code: number) => never | void;
}

/**
 * The start-up gate for the Credo runtime: opens Credo's store before the server listens, so the first requests
 * after a deploy do not race to start it, and a store that cannot be opened stops the boot with its reason instead
 * of failing Credo calls one by one. Skipped, with a warning, when Credo's storage is not configured at all (the
 * engine then fails each call with a configuration error, as before).
 */
export async function enforceCredoRuntime(options: EnforceCredoRuntimeOptions = {}): Promise<void> {
	const env = options.env ?? process.env;
	const log = options.log ?? console.log;
	const error = options.error ?? console.error;

	if (env.ENABLE_EXTERNAL_DB !== 'true') return;
	if (!CREDO_STORAGE_VARIABLES.some((name) => env[name]?.trim())) {
		error(
			`Credo runtime not started: Credo storage is not configured (${CREDO_STORAGE_VARIABLES.join(', ')}), so Credo calls will fail`
		);
		return;
	}

	try {
		await (options.start ?? startCredoRuntime)();
		log('Credo runtime: store open');
	} catch (cause) {
		const detail = (cause instanceof Error ? cause.message : String(cause)).replace(/\s*\n\s*/g, ' / ').trim();
		error(`Credo runtime could not start, stopping: ${detail}`);
		(options.exit ?? process.exit)(1);
	}
}
