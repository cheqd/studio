import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { FeatureFlagService, validateFlagWrite } from '../../services/api/feature-flag.js';

export const FLAGS_ADMIN_SCOPE = 'admin:flags:update';

export class FlagsAdminController {
	/**
	 * @openapi
	 *
	 * /admin/flags:
	 *   put:
	 *     summary: Set a feature flag (staff only).
	 *     description: Creates or replaces one flag, either global or for one customer. Every change is audited.
	 *     tags: [Flags]
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [flagKey, value, reason]
	 *             properties:
	 *               flagKey:
	 *                 type: string
	 *                 enum: [engine, ui]
	 *               customerId:
	 *                 type: string
	 *                 format: uuid
	 *                 description: Omit for a global flag.
	 *               route:
	 *                 type: string
	 *                 enum: [did, resource, credential, status-list, key, presentation, verify]
	 *                 description: Engine flags only. Omit to apply to every route.
	 *               value:
	 *                 type: object
	 *                 example: { engine: veramo }
	 *               reason:
	 *                 type: string
	 *                 maxLength: 500
	 *     responses:
	 *       200:
	 *         description: The flag was stored.
	 *       400:
	 *         description: The request body failed validation.
	 *       401:
	 *         description: Unauthorised.
	 *       403:
	 *         description: The caller is not staff.
	 *       500:
	 *         description: An internal error has occurred.
	 */
	public async putFlag(request: Request, response: Response) {
		// The auth rule already requires the scope; this keeps the route staff-only if the rule is ever loosened.
		const scopes: string[] = response.locals.scopes || [];
		if (process.env.ENABLE_AUTHENTICATION === 'true' && !scopes.includes(FLAGS_ADMIN_SCOPE)) {
			return response.status(StatusCodes.FORBIDDEN).json({ error: 'Only staff can change feature flags.' });
		}

		const validation = validateFlagWrite(request.body);
		if (!validation.ok) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: validation.error });
		}

		const actor: string = response.locals.user?.logToId || response.locals.customer?.customerId || 'unknown';
		try {
			// The flag and its `adminAuditLog` row are written in one transaction (engine spec 4.2)
			const { flag: stored } = await FeatureFlagService.instance.setFlag(validation.write, actor);
			return response.status(StatusCodes.OK).json({ flag: stored });
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}
}
