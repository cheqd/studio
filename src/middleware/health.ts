import express from 'express';
import { isShuttingDown } from '../helpers/shutdown-state.js';

/**
 * Liveness and readiness. Mounted before limits and authentication; they carry no data. Readiness answers 503 as soon
 * as shutdown begins, so the platform stops routing here while in-flight requests finish. While shutting down every
 * response also asks the client to drop its keep-alive connection.
 */
export function healthRouter(): express.Router {
	const router = express.Router();
	router.get(['/health', '/healthz', '/live', '/livez'], (_req, res) => {
		res.status(200).json({ status: 'ok' });
	});
	router.get(['/ready', '/readyz', '/readiness'], (_req, res) => {
		if (isShuttingDown()) return res.status(503).json({ status: 'shutting-down' });
		return res.status(200).json({ status: 'ready' });
	});
	router.use((_req, res, next) => {
		if (isShuttingDown()) res.setHeader('Connection', 'close');
		next();
	});
	return router;
}
