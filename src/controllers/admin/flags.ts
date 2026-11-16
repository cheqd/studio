import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { veramoOverrideEnabled } from '../../services/identity/engine/new-artefact-policy.js';
import { requireStaffScope, STAFF_SCOPES } from './staff-guard.js';
import { FeatureFlagService, validateFlagWrite } from '../../services/api/feature-flag.js';

export const FLAGS_ADMIN_SCOPE = STAFF_SCOPES.flagsUpdate;

export class FlagsAdminController {
	/**
	 * @openapi
	 *
	 * /admin/flags:
	 *   put:
	 *     summary: Set a feature flag (staff only).
	 *     description: Creates or replaces one flag, either global or for one customer. Every change is audited. Engine flags only choose the engine for NEW artefacts, and Credo is the default for every family. Veramo is retired for new artefacts, so an engine flag of `veramo` has no effect unless the instances run the temporary override `VERAMO_NEW_ARTEFACT_OVERRIDE=true`; each artefact it then creates on Veramo is logged as `veramo-new-artefact-override`. Existing artefacts always use the engine recorded on them, whatever a flag says.
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
	 *         description: The flag was stored. A `warning` is added when an engine flag of `veramo` was stored while the override is off on the instance that handled the request (the flag then has no effect).
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
		// The auth rule already requires the scope; this applies the full staff policy as well.
		if (!requireStaffScope(response, FLAGS_ADMIN_SCOPE, 'Only staff can change feature flags.')) return response;

		const validation = validateFlagWrite(request.body);
		if (!validation.ok) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: validation.error });
		}

		const actor: string = response.locals.user?.logToId || response.locals.customer?.customerId || 'unknown';
		try {
			// The flag and its `adminAuditLog` row are written in one transaction (engine spec 4.2)
			const { flag: stored } = await FeatureFlagService.instance.setFlag(validation.write, actor);
			// A veramo engine flag does nothing unless the temporary override is on: say so rather than let it look live
			const warning =
				validation.write.flagKey === 'engine' &&
				validation.write.value.engine === 'veramo' &&
				!veramoOverrideEnabled()
					? 'Stored, but ignored for new artefacts: Veramo is retired and the VERAMO_NEW_ARTEFACT_OVERRIDE override is off on this instance.'
					: undefined;
			return response.status(StatusCodes.OK).json({ flag: stored, ...(warning ? { warning } : {}) });
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}
}
