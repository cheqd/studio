import { Request, Response, NextFunction } from 'express';

export class Middleware {
	static async parseUrlEncodedJson(request: Request, response: Response, next: NextFunction) {
		// Check if the request content type is URL-encoded
		if (request.is('application/x-www-form-urlencoded')) {
			// Parse the inner JSON strings
			for (const key in request.body) {
				try {
					if (request.body[key] === '') {
						request.body[key] = undefined;
					} else {
						if (typeof request.body[key] === 'string' && request.body[key].includes(',')) {
							// Check if the value contains commas
							request.body[key] = request.body[key].split(',');
						}
						request.body[key] = JSON.parse(request.body[key]);
					}
				} catch (error) {
					// Failed to parse the value as JSON, leave it as is
				}
			}
		}
		next();
	}
}
