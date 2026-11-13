import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { FeatureFlagService, resolveFlags } from '../../services/api/feature-flag.js';

export class FlagsController {
	/**
	 * @openapi
	 *
	 * /flags:
	 *   get:
	 *     summary: Fetch the feature flags that apply to the caller.
	 *     description: Returns the global defaults with the caller's own overrides applied. `ui` is `classic` unless a flag says otherwise, and every engine route is `veramo` unless a flag says otherwise.
	 *     tags: [ Account ]
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 customerId:
	 *                   type: string
	 *                   format: uuid
	 *                   description: The caller's own Studio customer id, used as the analytics identifier. Omitted when the request has no customer. Nothing else about the account is returned.
	 *                 ui:
	 *                   type: string
	 *                   enum: [classic, new]
	 *                   example: classic
	 *                 engine:
	 *                   type: object
	 *                   properties:
	 *                     default:
	 *                       type: string
	 *                       enum: [veramo, credo]
	 *                       example: veramo
	 *                     routes:
	 *                       type: object
	 *                       additionalProperties:
	 *                         type: string
	 *                         enum: [veramo, credo]
	 *                       example:
	 *                         did: veramo
	 *                         credential: veramo
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async getFlags(_request: Request, response: Response) {
		const customerId: string | undefined = response.locals.customer?.customerId;
		// Only the caller's own id, and only when there is one (never null)
		const identity = customerId ? { customerId } : {};
		try {
			const flags = await FeatureFlagService.instance.flagsFor(customerId);
			return response.status(StatusCodes.OK).json({ ...flags, ...identity });
		} catch {
			// The featureFlag table may not exist yet (or there is no external database): answer with the defaults.
			return response.status(StatusCodes.OK).json({ ...resolveFlags([], customerId), ...identity });
		}
	}
}
