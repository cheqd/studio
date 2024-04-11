import type { Request, Response, NextFunction } from 'express';
import { eventTracker } from '../services/track/tracker.js';
import type { INotifyMessage } from '../types/track.js';

export class ResponseTracker {
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
				if (response.locals.customer) {
					parts.push('Customer: ' + response.locals.customer.customerId);
				}
				if (body && body.error) {
					parts.push('Message: ' + body.error);
				}
				return parts.join(' | ');
			};
			// Notify
			if (body) {
				eventTracker.emit('notify', {
					message: compileMessage(),
					severity: body.error ? 'error' : 'info',
				} satisfies INotifyMessage);
			}

			return originalJson.apply(response, [body]);
		};
		return next();
	}
}
