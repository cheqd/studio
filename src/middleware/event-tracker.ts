import type { Request, Response, NextFunction } from 'express';
import { eventTracker } from '../services/track/tracker.js';
import type { INotifyMessage } from '../types/track.js';

export class FailedResponseTracker {
	public async trackJson(request: Request, response: Response, next: NextFunction) {
		const originalJson = response.json;
		response.json = (body) => {
			// Message compiler
			const compileMessage = () => {
				const parts = [];
				const date = new Date().toISOString();
				parts.push(date);
				parts.push('URL: ' + response.req.url);
				parts.push('Method: ' + response.req.method);
				parts.push('Status: ' + response.statusCode);
				if (body && body.error) {
					parts.push('Message: ' + body.error);
				}
				return parts.join(' | ');
			};
			// Notify
			if (body && body.error) {
				eventTracker.emit('notify', {
					message: compileMessage(),
					severity: 'error',
				} satisfies INotifyMessage);
			}
			return originalJson.apply(response, [body]);
		};
		return next();
	}
}
