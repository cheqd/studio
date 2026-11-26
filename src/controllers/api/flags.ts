import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { FeatureFlagService, resolveFlags } from '../../services/api/feature-flag.js';
import { CredentialScreensService } from '../../services/api/credential-screens.js';

export class FlagsController {
	/**
	 * @openapi
	 *
	 * /flags:
	 *   get:
	 *     summary: Fetch the feature flags that apply to the caller.
	 *     description: Returns the global defaults with the caller's own overrides applied. `ui` is `classic` unless a flag says otherwise, and every engine route is `credo`, the engine for NEW artefacts (Veramo is retired for new artefacts, so a `veramo` flag is shown only while the temporary override is on). Existing artefacts use the engine recorded on them, whatever is shown here.
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
	 *                 credentialScreens:
	 *                   type: boolean
	 *                   description: Whether the portal shows its credential screens (issue, verify, issued, status lists) to this customer. On for customers who issued, verified or created a status list before the release, or when staff switched them on.
	 *                   example: false
	 *                 engine:
	 *                   type: object
	 *                   properties:
	 *                     default:
	 *                       type: string
	 *                       enum: [veramo, credo]
	 *                       example: credo
	 *                     routes:
	 *                       type: object
	 *                       additionalProperties:
	 *                         type: string
	 *                         enum: [veramo, credo]
	 *                       example:
	 *                         did: credo
	 *                         credential: credo
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
			const rows = (await FeatureFlagService.instance.rowsFor(customerId)) ?? [];
			const screens = await CredentialScreensService.instance.decide(customerId, rows);
			return response.status(StatusCodes.OK).json({ ...flags, credentialScreens: screens.enabled, ...identity });
		} catch {
			// The featureFlag table may not exist yet (or there is no external database): answer with the defaults.
			return response
				.status(StatusCodes.OK)
				.json({ ...resolveFlags([], customerId), credentialScreens: false, ...identity });
		}
	}
}
