import type { Request, Response } from 'express';

/**
 * GET /auth/user-info. Public by decision (F-12): the Swagger UI sign-in button (src/static/custom-button.ts) calls it
 * before sign-in to choose between "Log in" and "Log out". Without a signed-in session it says only that; with one it
 * returns the caller's own session user, as before.
 */
export function userInfo(request: Request, response: Response) {
	if (!request.user?.isAuthenticated) {
		return response.json({ isAuthenticated: false });
	}
	return response.json(request.user);
}
