import * as http from 'http';
import App, { dbReady } from './app.js';
import * as dotenv from 'dotenv';
import { assertSecureStartup } from './helpers/startup-guard.js';
import { createGracefulShutdown, shutdownGraceSeconds } from './helpers/graceful-shutdown.js';
import { Connection } from './database/connection/connection.js';
import { shutdownCredoRuntime } from './services/identity/engine/credo/index.js';
import { closeSharedPayerLockSource } from './services/identity/payer-lock-pool.js';
import { payerWritesInFlightCount } from './services/identity/ledger-lock.js';
import { flushAnalytics } from './services/analytics/posthog.js';
import { enforceAskarNative } from './services/identity/engine/credo/askar-native.js';
import { enforceCredoRuntime } from './services/identity/engine/credo/boot.js';

dotenv.config();
assertSecureStartup();
// Fail on boot, not on the first Credo request, if Askar's native library is missing or incompatible: importing the
// package is lazy and does not open the library, so this calls into it
await enforceAskarNative();

const port = process.env.PORT || 3000;
App.set('port', port);

const server = http.createServer(App);
await dbReady;
// Open Credo's store once, before listening: concurrent first requests after a deploy no longer start it, and a store
// that cannot be opened stops the boot with its reason
await enforceCredoRuntime();
server.listen(port);

server.on('listening', () => {
	console.log('Listening on port:', port);
});

server.on('error', onError);

// Orderly shutdown on SIGTERM/SIGINT: drain in-flight requests and queued ledger writes (bounded by
// SHUTDOWN_GRACE_SECONDS), then close the Credo runtime, the lock pool (which releases advisory locks) and the main
// pool. A second signal exits at once.
const gracefulShutdown = createGracefulShutdown({
	server,
	graceSeconds: shutdownGraceSeconds(),
	pendingWork: payerWritesInFlightCount,
	steps: [
		{ name: 'credo runtime', run: shutdownCredoRuntime },
		{ name: 'lock pool', run: closeSharedPayerLockSource },
		{ name: 'analytics flush', run: flushAnalytics },
		{
			name: 'database pool',
			run: async () => {
				const source = Connection.instance.dbConnection;
				if (source.isInitialized) await source.destroy();
			},
		},
	],
	exit: (code) => process.exit(code),
});
process.on('SIGTERM', () => void gracefulShutdown.handleSignal('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown.handleSignal('SIGINT'));

function onError(error: NodeJS.ErrnoException): void {
	if (error.syscall !== 'listen') {
		throw error;
	}
	const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;
	switch (error.code) {
		case 'EACCES':
			console.error(`${bind} requires elevated privileges`);
			process.exit(1);
			break;
		case 'EADDRINUSE':
			console.error(`${bind} is already in use`);
			process.exit(1);
			break;
		default:
			throw error;
	}
}
