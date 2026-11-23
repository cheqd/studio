import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { veramoOverrideEnabled } from '../../services/identity/engine/new-artefact-policy.js';
import { requireStaffScope, STAFF_SCOPES } from './staff-guard.js';
import validator from 'validator';
import { FeatureFlagService, resolveFlags, validateFlagWrite } from '../../services/api/feature-flag.js';

export const FLAGS_ADMIN_SCOPE = STAFF_SCOPES.flagsUpdate;
export const FLAGS_READ_SCOPE = STAFF_SCOPES.customersRead;

export class FlagsAdminController {
	/**
	 * @openapi
	 *
	 * /admin/customers/{id}/flags:
	 *   get:
	 *     summary: Read the feature flags that apply to one customer (staff only).
	 *     description: The flags this customer gets now (the engine for NEW artefacts on each route, and the UI), the stored rows behind them (global and this customer's own), and whether the temporary Veramo override is on for the instance that answered. A stored `veramo` engine row has no effect while the override is off, so `effective` can say `credo` while a row says `veramo`. Existing artefacts always use the engine recorded on them.
	 *     tags: [Admin]
	 *     parameters:
	 *       - in: path
	 *         name: id
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *     responses:
	 *       200:
	 *         description: The customer's flags.
	 *       400:
	 *         description: The id is not a UUID.
	 *       401:
	 *         description: Unauthorised.
	 *       403:
	 *         description: The caller is not staff.
	 */
	public async getCustomerFlags(request: Request, response: Response) {
		if (!requireStaffScope(response, FLAGS_READ_SCOPE, 'Only staff can read customer flags.')) return response;
		const customerId = request.params.id;
		if (typeof customerId !== 'string' || !validator.isUUID(customerId)) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: 'id must be a UUID' });
		}
		const overrideEnabled = veramoOverrideEnabled();
		try {
			const rows = await FeatureFlagService.instance.readRows(customerId);
			return response.status(StatusCodes.OK).json({
				customerId,
				effective: resolveFlags(rows, customerId),
				rows: rows.map((row) => ({
					scope: row.customerId ? 'customer' : 'global',
					flagKey: row.flagKey,
					route: row.route,
					value: row.value,
					updatedAt: row.updatedAt,
				})),
				overrideEnabled,
			});
		} catch {
			// No featureFlag table (or no external database): the compiled defaults apply
			return response
				.status(StatusCodes.OK)
				.json({ customerId, effective: resolveFlags([], customerId), rows: [], overrideEnabled });
		}
	}

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
