import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { body, param, query, validationResult } from '../validator/index.js';
import { AgentServiceError, agentServices } from '../../services/agent/index.js';
import type { AgentServices } from '../../services/agent/index.js';
import { unfundedPayerFailure } from '../../helpers/ledger-errors.js';
import { LedgerUnavailableError } from '../../services/identity/ledger-lock.js';
import { IdempotencyError, IdempotencyService, hashRequest } from '../../services/idempotency/idempotency.js';
import type { IdempotentResult } from '../../services/idempotency/idempotency.js';
import { AGENT_NETWORKS, AGENT_SETTABLE_STATUSES, CAPABILITY_NAMES, GRANT_TYPES } from '../../types/agent.js';
import type {
	AgentCardRecord,
	AgentEventRecord,
	AgentNetwork,
	AgentRecord,
	AuthorityGrantRecord,
	AuthorityGrantWithStatus,
	AuthoritySummary,
	GrantType,
} from '../../types/agent.js';
import { summariseGrant } from '../../services/agent/grant-summary.js';
import type { AgentKeyView } from '../../services/agent/agent-key-view.js';
import type { CallContext } from '../../services/agent/agent-service.js';

/**
 * @openapi
 *
 * components:
 *   schemas:
 *     Agent:
 *       type: object
 *       properties:
 *         agentId:
 *           type: string
 *           format: uuid
 *         did:
 *           type: string
 *           description: The agent's did:cheqd identifier. It has two keys, P-256 (default signing key) and Ed25519.
 *           example: did:cheqd:testnet:a1b2c3d4-0000-4000-8000-000000000001
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         actsForDid:
 *           type: string
 *           nullable: true
 *           description: The organisation DID this agent acts for.
 *         status:
 *           type: string
 *           enum: [active, suspended, deleted]
 *         capabilities:
 *           $ref: '#/components/schemas/AgentCapabilities'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     AgentCapabilities:
 *       type: object
 *       description: Labels the owner chose for the agent. They describe it; nothing enforces them.
 *       properties:
 *         a2a:
 *           type: boolean
 *         ap2:
 *           type: boolean
 *         kyaOs:
 *           type: boolean
 *         mcp:
 *           type: boolean
 *     AuthoritySummary:
 *       type: object
 *       description: The agent's active grants (not revoked, not expired, agent not suspended) in brief.
 *       properties:
 *         actsFor:
 *           type: string
 *           nullable: true
 *           description: The DID the active acts-for grant says the agent acts for, else null.
 *         grantCounts:
 *           type: object
 *           properties:
 *             actsFor:
 *               type: integer
 *             mandate:
 *               type: integer
 *             delegation:
 *               type: integer
 *             toolScope:
 *               type: integer
 *     AgentListItem:
 *       allOf:
 *         - $ref: '#/components/schemas/Agent'
 *         - type: object
 *           properties:
 *             authoritySummary:
 *               $ref: '#/components/schemas/AuthoritySummary'
 *     AgentDetail:
 *       allOf:
 *         - $ref: '#/components/schemas/AgentListItem'
 *         - type: object
 *           properties:
 *             cardUrl:
 *               type: string
 *               format: uri
 *               nullable: true
 *               description: Where the newest published card can be fetched (a DID-Linked Resource). Null when no card is published.
 *     AgentKey:
 *       type: object
 *       description: One key of the agent. Public material only.
 *       properties:
 *         keyId:
 *           type: string
 *           description: The full DID URL of the verification method.
 *         type:
 *           type: string
 *           enum: [Ed25519, P-256]
 *         algorithm:
 *           type: string
 *           enum: [EdDSA, ES256]
 *         status:
 *           type: string
 *           enum: [active, rotated, revoked]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         rotatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         publicKeyMultibase:
 *           type: string
 *         usedBy:
 *           type: array
 *           items:
 *             type: string
 *             enum: [did, a2a, ap2, kya-os]
 *     AgentEvent:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         type:
 *           type: string
 *           enum: [registered, authority-granted, authority-revoked, authority-expiry-changed, key-added, key-rotated, card-published, card-updated]
 *         at:
 *           type: string
 *           format: date-time
 *         actor:
 *           type: string
 *           enum: [owner, api-key, system]
 *         detail:
 *           type: object
 *           description: Non-secret details of the event (ids, types, dates).
 *     AgentCardInput:
 *       type: object
 *       required: [endpoint]
 *       properties:
 *         endpoint:
 *           type: string
 *           format: uri
 *           description: Where the agent serves A2A. Must be https.
 *         protocolBinding:
 *           type: string
 *           enum: [JSONRPC, GRPC, HTTP+JSON]
 *           default: JSONRPC
 *         description:
 *           type: string
 *         version:
 *           type: string
 *           default: 1.0.0
 *         skills:
 *           type: array
 *           items:
 *             type: object
 *             required: [id, name]
 *             properties:
 *               id:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               examples:
 *                 type: array
 *                 items:
 *                   type: string
 *         streaming:
 *           type: boolean
 *         pushNotifications:
 *           type: boolean
 *         documentationUrl:
 *           type: string
 *           format: uri
 *     AgentCard:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         agentId:
 *           type: string
 *           format: uuid
 *         version:
 *           type: integer
 *         card:
 *           type: object
 *           description: The signed A2A agent card (v1.0), with its JWS in `signatures`.
 *         jws:
 *           type: string
 *           description: The same signature as a detached compact JWS (`protected..signature`).
 *         resourceId:
 *           type: string
 *           nullable: true
 *           description: The DID-Linked Resource id, when the card has been published.
 *         publishedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *     AuthorityGrant:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         agentId:
 *           type: string
 *           format: uuid
 *         grantType:
 *           type: string
 *           enum: [acts-for, tool-scope, mandate, delegation]
 *         summary:
 *           type: string
 *           description: A short human-readable line built on the server from the grant's policy. Present on grant lists and on expiry changes.
 *         issuedCredentialId:
 *           type: string
 *           nullable: true
 *         statusListId:
 *           type: string
 *           nullable: true
 *         statusIndex:
 *           type: integer
 *           nullable: true
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         revokedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *     PaymentAddressBinding:
 *       type: object
 *       description: Proposed. A payment address bound to an agent. The credential is not part of this object.
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         account:
 *           type: string
 *           description: The CAIP-10 account, normalised (EVM addresses are lower case).
 *           example: eip155:8453:0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed
 *         status:
 *           type: string
 *           enum: [active, suspended, revoked]
 *           description: '`suspended` while the agent is suspended.'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         revokedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */

const agentDto = (agent: AgentRecord) => ({
	agentId: agent.agentId,
	did: agent.did,
	name: agent.name,
	description: agent.description ?? null,
	actsForDid: agent.actsForDid ?? null,
	status: agent.status,
	capabilities: agent.capabilities,
	createdAt: agent.createdAt,
	updatedAt: agent.updatedAt,
});

const listItemDto = (agent: AgentRecord, authoritySummary: AuthoritySummary) => ({
	...agentDto(agent),
	authoritySummary,
});

const keyDto = (key: AgentKeyView) => ({
	keyId: key.keyId,
	type: key.type,
	algorithm: key.algorithm,
	status: key.status,
	createdAt: key.createdAt,
	rotatedAt: key.rotatedAt,
	publicKeyMultibase: key.publicKeyMultibase,
	usedBy: key.usedBy,
});

const eventDto = (event: AgentEventRecord) => ({
	id: event.id,
	type: event.type,
	at: event.createdAt,
	actor: event.actor,
	detail: event.detail,
});

/** Who is calling, for the activity feed and audit log. `authMethod` is set by the API key middleware. */
const callContext = (response: Response): CallContext => ({
	actor: response.locals?.authMethod === 'api-key' ? 'api-key' : 'owner',
	userId: response.locals?.user?.logToId,
});

const cardDto = (card: AgentCardRecord) => ({
	id: card.id,
	agentId: card.agentId,
	version: card.version,
	card: card.card,
	jws: card.jws ?? null,
	resourceId: card.resourceId ?? null,
	publishedAt: card.publishedAt ?? null,
	createdAt: card.createdAt,
});

const grantDto = (grant: AuthorityGrantRecord) => ({
	id: grant.id,
	agentId: grant.agentId,
	grantType: grant.grantType,
	issuedCredentialId: grant.issuedCredentialId ?? null,
	statusListId: grant.statusListId ?? null,
	statusIndex: grant.statusIndex ?? null,
	expiresAt: grant.expiresAt ?? null,
	revokedAt: grant.revokedAt ?? null,
	createdAt: grant.createdAt,
});

const bindingDto = (binding: { id: string; account: string; createdAt: Date; revokedAt?: Date | null }) => ({
	id: binding.id,
	account: binding.account,
	status: binding.revokedAt ? 'revoked' : 'active',
	createdAt: binding.createdAt,
	revokedAt: binding.revokedAt ?? null,
});

/** `capabilities` is an object with any of the four flags as booleans, and nothing else. */
function capabilitiesValidators() {
	return [
		body('capabilities')
			.optional()
			.custom((value) => typeof value === 'object' && value !== null && !Array.isArray(value))
			.withMessage('capabilities must be an object')
			.bail()
			.custom((value) =>
				Object.keys(value).every((name) => (CAPABILITY_NAMES as readonly string[]).includes(name))
			)
			.withMessage(`capabilities may only have: ${CAPABILITY_NAMES.join(', ')}`)
			.bail()
			.custom((value) => Object.values(value).every((flag) => typeof flag === 'boolean'))
			.withMessage('every capability must be true or false')
			.bail(),
	];
}

const isHttps = (value: unknown) => {
	if (typeof value !== 'string') return false;
	try {
		return new URL(value).protocol === 'https:';
	} catch {
		return false;
	}
};

export class AgentController {
	public static registerValidator = [
		body('name')
			.exists()
			.withMessage('name is required')
			.bail()
			.isString()
			.isLength({ min: 1, max: 200 })
			.withMessage('name must be 1 to 200 characters')
			.bail(),
		body('description')
			.optional()
			.isString()
			.isLength({ max: 2000 })
			.withMessage('description is at most 2000 characters')
			.bail(),
		body('network')
			.optional()
			.isIn([...AGENT_NETWORKS])
			.withMessage(`network must be one of: ${AGENT_NETWORKS.join(', ')}`)
			.bail(),
		body('actsForDid').optional().isDID().bail(),
		...capabilitiesValidators(),
		body('useCase')
			.optional()
			.isString()
			.isLength({ max: 64 })
			.withMessage('useCase is at most 64 characters')
			.bail(),
	];

	public static listValidator = [
		query('q').optional().isString().isLength({ max: 200 }).withMessage('q is at most 200 characters').bail(),
		query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1 to 100').bail(),
		query('page').optional().isInt({ min: 1 }).withMessage('page must be 1 or more').bail(),
	];

	public static idValidator = [param('agentId').isUUID().withMessage('agentId must be a UUID').bail()];

	public static updateValidator = [
		param('agentId').isUUID().withMessage('agentId must be a UUID').bail(),
		body('name')
			.optional()
			.isString()
			.isLength({ min: 1, max: 200 })
			.withMessage('name must be 1 to 200 characters')
			.bail(),
		body('description')
			.optional({ values: 'null' })
			.isString()
			.isLength({ max: 2000 })
			.withMessage('description is at most 2000 characters')
			.bail(),
		body('actsForDid').optional({ values: 'null' }).isDID().bail(),
		...capabilitiesValidators(),
		body('status')
			.optional()
			.isIn([...AGENT_SETTABLE_STATUSES])
			.withMessage(`status must be one of: ${AGENT_SETTABLE_STATUSES.join(', ')}`)
			.bail(),
	];

	public static createCardValidator = [
		param('agentId').isUUID().withMessage('agentId must be a UUID').bail(),
		body('card')
			.exists()
			.withMessage('card is required')
			.bail()
			.isObject()
			.withMessage('card must be an object')
			.bail(),
		body('card.endpoint').custom(isHttps).withMessage('card.endpoint must be an https URL').bail(),
		body('card.protocolBinding').optional().isIn(['JSONRPC', 'GRPC', 'HTTP+JSON']).bail(),
		body('card.skills')
			.optional()
			.isArray({ max: 50 })
			.withMessage('card.skills must be a list of at most 50 skills')
			.bail(),
		body('card.skills.*.id').isString().notEmpty().withMessage('every skill needs an id').bail(),
		body('card.skills.*.name').isString().notEmpty().withMessage('every skill needs a name').bail(),
		body('card.documentationUrl')
			.optional()
			.custom(isHttps)
			.withMessage('card.documentationUrl must be an https URL')
			.bail(),
		body('publish').optional().isBoolean().withMessage('publish must be a boolean').bail(),
		body('alg').optional().isIn(['ES256', 'EdDSA']).withMessage('alg must be ES256 or EdDSA').bail(),
	];

	public static getCardValidator = [
		param('agentId').isUUID().withMessage('agentId must be a UUID').bail(),
		query('version').optional().isInt({ min: 1 }).withMessage('version must be 1 or more').bail(),
	];

	public static grantValidator = [
		param('agentId').isUUID().withMessage('agentId must be a UUID').bail(),
		body('grantType')
			.exists()
			.isIn([...GRANT_TYPES])
			.withMessage(`grantType must be one of: ${GRANT_TYPES.join(', ')}`)
			.bail(),
		body('issuerDid').optional().isDID().bail(),
		body('expiresAt').optional().isISO8601().withMessage('expiresAt must be an ISO 8601 date').bail(),
		body('tools').optional().isArray({ max: 50 }).withMessage('tools must be a list of at most 50 names').bail(),
		body('scopes').optional().isArray({ max: 50 }).withMessage('scopes must be a list of at most 50 names').bail(),
		body('mandate').optional().isObject().withMessage('mandate must be an object').bail(),
	];

	public static expiryValidator = [
		param('agentId').isUUID().withMessage('agentId must be a UUID').bail(),
		param('grantId').isUUID().withMessage('grantId must be a UUID').bail(),
		body('expiresAt')
			.exists()
			.withMessage('expiresAt is required')
			.bail()
			.isString()
			.isISO8601()
			.withMessage('expiresAt must be an ISO 8601 date')
			.bail(),
	];

	public static rotateKeyValidator = [
		param('agentId').isUUID().withMessage('agentId must be a UUID').bail(),
		body('keyId')
			.exists()
			.withMessage('keyId is required')
			.bail()
			.isString()
			.isLength({ min: 1, max: 512 })
			.withMessage('keyId must be 1 to 512 characters')
			.bail(),
		body('confirm')
			.custom((value) => value === true)
			.withMessage('confirm must be true to rotate a key')
			.bail(),
	];

	public static addKeyValidator = [
		param('agentId').isUUID().withMessage('agentId must be a UUID').bail(),
		body('type')
			.exists()
			.withMessage('type is required')
			.bail()
			.isIn(['Ed25519'])
			.withMessage('type must be Ed25519')
			.bail(),
	];

	public static activityValidator = [
		param('agentId').isUUID().withMessage('agentId must be a UUID').bail(),
		query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1 to 100').bail(),
		query('page').optional().isInt({ min: 1 }).withMessage('page must be 1 or more').bail(),
	];

	public static revokeValidator = [
		param('agentId').isUUID().withMessage('agentId must be a UUID').bail(),
		param('grantId').isUUID().withMessage('grantId must be a UUID').bail(),
	];

	public static bindPaymentAddressValidator = [
		param('agentId').isUUID().withMessage('agentId must be a UUID').bail(),
		body('account')
			.exists()
			.withMessage('account is required')
			.bail()
			.isString()
			.withMessage('account must be a CAIP-10 string such as eip155:8453:0x...')
			.bail()
			.isLength({ min: 1, max: 175 })
			.withMessage('account is at most 175 characters')
			.bail(),
	];

	public static revokePaymentAddressValidator = [
		param('agentId').isUUID().withMessage('agentId must be a UUID').bail(),
		param('bindingId').isUUID().withMessage('bindingId must be a UUID').bail(),
	];

	constructor(
		private readonly services: () => Promise<AgentServices> | AgentServices = agentServices,
		private readonly idempotency: () => Promise<IdempotencyService> | IdempotencyService = defaultIdempotency
	) {}

	/**
	 * @openapi
	 *
	 * /agents:
	 *   post:
	 *     tags: [ Agents ]
	 *     summary: Register an agent.
	 *     description: Creates the agent's did:cheqd identifier with two keys (P-256 as the default signing key, and Ed25519) and the agent record. Needs the Credo engine for the account. Costs CHEQ on the ledger like any DID creation.
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [name]
	 *             properties:
	 *               name:
	 *                 type: string
	 *               description:
	 *                 type: string
	 *               network:
	 *                 type: string
	 *                 enum: [testnet, mainnet]
	 *                 default: testnet
	 *               actsForDid:
	 *                 type: string
	 *                 description: A DID in your account that this agent acts for.
	 *               capabilities:
	 *                 $ref: '#/components/schemas/AgentCapabilities'
	 *               useCase:
	 *                 type: string
	 *                 maxLength: 64
	 *                 description: Free text, for analytics only. Stored, never trusted, not returned.
	 *     responses:
	 *       201:
	 *         description: The agent was registered.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Agent'
	 *       400:
	 *         description: A problem with the input fields has occurred.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       402:
	 *         description: The payer account has no CHEQ, or too little to pay the fee.
	 *       404:
	 *         description: actsForDid is not a DID in your account.
	 *       501:
	 *         description: The identity engine for this account cannot serve the agent endpoints yet. They need the Credo engine.
	 *   get:
	 *     tags: [ Agents ]
	 *     summary: List your agents.
	 *     description: Each agent carries its `capabilities` and an `authoritySummary` of its active grants. `total` is the count after `q` filtering.
	 *     parameters:
	 *       - name: q
	 *         in: query
	 *         description: Case-insensitive match on name, description or DID, applied in the database query (not after paging).
	 *         schema:
	 *           type: string
	 *           maxLength: 200
	 *       - name: limit
	 *         in: query
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 50
	 *       - name: page
	 *         in: query
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 total:
	 *                   type: integer
	 *                 agents:
	 *                   type: array
	 *                   items:
	 *                     $ref: '#/components/schemas/Agent'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 */
	public register = async (request: Request, response: Response) => {
		return this.handleIdempotent(request, response, async () => {
			const { name, description, network, actsForDid, capabilities, useCase } = request.body;
			const agent = await (
				await this.services()
			).agents.register(
				response.locals.customer,
				{
					name,
					description,
					network: (network ?? 'testnet') as AgentNetwork,
					actsForDid,
					capabilities,
					useCase,
				},
				callContext(response)
			);
			return { status: StatusCodes.CREATED, body: agentDto(agent) };
		});
	};

	public list = async (request: Request, response: Response) => {
		return this.handle(request, response, async () => {
			const limit = Number(request.query.limit ?? 50);
			const page = Number(request.query.page ?? 1);
			const q = typeof request.query.q === 'string' ? request.query.q : undefined;
			const { items, total } = await (
				await this.services()
			).agents.list(response.locals.customer, {
				limit,
				offset: (page - 1) * limit,
				q,
			});
			return response
				.status(StatusCodes.OK)
				.json({ total, agents: items.map((item) => listItemDto(item.agent, item.authoritySummary)) });
		});
	};

	/**
	 * @openapi
	 *
	 * /agents/{agentId}:
	 *   get:
	 *     tags: [ Agents ]
	 *     summary: Get an agent.
	 *     description: Includes `capabilities`, an `authoritySummary` and `cardUrl` (null when no card is published).
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/AgentDetail'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         description: No such agent in your account. Also returned for an agent that belongs to another account.
	 *   patch:
	 *     tags: [ Agents ]
	 *     summary: Update an agent.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               name:
	 *                 type: string
	 *               description:
	 *                 type: string
	 *                 nullable: true
	 *               actsForDid:
	 *                 type: string
	 *                 nullable: true
	 *               capabilities:
	 *                 $ref: '#/components/schemas/AgentCapabilities'
	 *               status:
	 *                 type: string
	 *                 enum: [active, suspended]
	 *     responses:
	 *       200:
	 *         description: The agent was updated.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Agent'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         description: No such agent in your account, or actsForDid is not a DID in your account.
	 *   delete:
	 *     tags: [ Agents ]
	 *     summary: Delete an agent.
	 *     description: Revokes every live authority grant and every live payment address binding of the agent, then removes the agent (soft delete; the DID stays on the ledger). If a grant or binding cannot be revoked the agent is not deleted.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *     responses:
	 *       200:
	 *         description: The agent was deleted.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 deleted:
	 *                   type: boolean
	 *                 revokedGrants:
	 *                   type: integer
	 *                 revokedPaymentAddresses:
	 *                   type: integer
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         description: No such agent in your account.
	 *       501:
	 *         description: The agent has live grants and the engine cannot revoke them.
	 */
	public get = async (request: Request, response: Response) => {
		return this.handle(request, response, async () => {
			const { agent, authoritySummary, cardUrl } = await (
				await this.services()
			).agents.detail(response.locals.customer, request.params.agentId as string);
			return response.status(StatusCodes.OK).json({ ...listItemDto(agent, authoritySummary), cardUrl });
		});
	};

	public update = async (request: Request, response: Response) => {
		return this.handle(request, response, async () => {
			const { name, description, actsForDid, status, capabilities } = request.body;
			const agent = await (
				await this.services()
			).agents.update(response.locals.customer, request.params.agentId as string, {
				name,
				description,
				actsForDid,
				status,
				capabilities,
			});
			return response.status(StatusCodes.OK).json(agentDto(agent));
		});
	};

	public remove = async (request: Request, response: Response) => {
		return this.handleIdempotent(request, response, async () => {
			const { revokedGrants, revokedPaymentAddresses } = await (
				await this.services()
			).agents.remove(response.locals.customer, request.params.agentId as string);
			return { status: StatusCodes.OK, body: { deleted: true, revokedGrants, revokedPaymentAddresses } };
		});
	};

	/**
	 * @openapi
	 *
	 * /agents/{agentId}/card:
	 *   post:
	 *     tags: [ Agents ]
	 *     summary: Create a signed agent card.
	 *     description: Builds an A2A v1.0 agent card, signs it with the agent's key (the key stays in the identity engine), checks the signature, stores it as the next version and, if asked, publishes it as a DID-Linked Resource of type A2AAgentCard. Needs the Credo engine.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [card]
	 *             properties:
	 *               card:
	 *                 $ref: '#/components/schemas/AgentCardInput'
	 *               publish:
	 *                 type: boolean
	 *                 default: false
	 *               alg:
	 *                 type: string
	 *                 enum: [ES256, EdDSA]
	 *                 default: ES256
	 *     responses:
	 *       201:
	 *         description: The card was created.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/AgentCard'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       402:
	 *         description: The payer account has no CHEQ, or too little to pay the fee (publishing writes to the ledger).
	 *       404:
	 *         description: No such agent in your account.
	 *       409:
	 *         description: The agent is not active, or its DID is deactivated.
	 *       501:
	 *         description: The identity engine for this account cannot serve the agent endpoints yet. They need the Credo engine.
	 *   get:
	 *     tags: [ Agents ]
	 *     summary: Get an agent card.
	 *     description: Returns the latest version, or the version given.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *       - name: version
	 *         in: query
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/AgentCard'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         description: No such agent in your account, or it has no card yet.
	 */
	public createCard = async (request: Request, response: Response) => {
		return this.handleIdempotent(request, response, async () => {
			const { card, publish, alg } = request.body;
			const created = await (
				await this.services()
			).agents.createCard(
				response.locals.customer,
				request.params.agentId as string,
				{
					card,
					publish: publish === true || publish === 'true',
					alg,
				},
				callContext(response)
			);
			return { status: StatusCodes.CREATED, body: cardDto(created) };
		});
	};

	public getCard = async (request: Request, response: Response) => {
		return this.handle(request, response, async () => {
			const version = request.query.version !== undefined ? Number(request.query.version) : undefined;
			const card = await (
				await this.services()
			).agents.getCard(response.locals.customer, request.params.agentId as string, version);
			return response.status(StatusCodes.OK).json(cardDto(card));
		});
	};

	/**
	 * @openapi
	 *
	 * /agents/{agentId}/authority:
	 *   get:
	 *     tags: [ Agents ]
	 *     summary: List the authority grants of an agent.
	 *     description: Returns every grant of the agent, live and revoked, newest first. A grant is `active`, `revoked` or `expired`. The credential itself is never returned here (it is returned once, when the grant is made). An agent that is not yours, or does not exist, is a 404.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 grants:
	 *                   type: array
	 *                   items:
	 *                     type: object
	 *                     properties:
	 *                       id:
	 *                         type: string
	 *                         format: uuid
	 *                       grantType:
	 *                         type: string
	 *                         enum: [acts-for, tool-scope, mandate, delegation]
	 *                       status:
	 *                         type: string
	 *                         enum: [active, revoked, expired, suspended]
	 *                         description: '`suspended` while the agent is suspended (a Studio view; the credential is unchanged).'
	 *                       summary:
	 *                         type: string
	 *                         description: A short human-readable line built on the server from the grant's policy, for example `Up to 50 USD per week, supplies`. No secrets, no raw credential.
	 *                         example: 'Tools: search, fetch'
	 *                       createdAt:
	 *                         type: string
	 *                         format: date-time
	 *                       expiresAt:
	 *                         type: string
	 *                         format: date-time
	 *                         nullable: true
	 *                       revokedAt:
	 *                         type: string
	 *                         format: date-time
	 *                         nullable: true
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         $ref: '#/components/schemas/NotFoundError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public listAuthority = async (request: Request, response: Response) => {
		return this.handle(request, response, async () => {
			const grants = await (
				await this.services()
			).agents.listAuthority(response.locals.customer, request.params.agentId as string);
			return response.status(StatusCodes.OK).json({ grants });
		});
	};

	/**
	 * @openapi
	 *
	 * /agents/{agentId}/authority:
	 *   post:
	 *     tags: [ Agents ]
	 *     summary: Grant authority to an agent.
	 *     description: |
	 *       Issues an authority credential to the agent, signed by one of your DIDs, with an entry in a Token Status List so it can be revoked. The credential is returned once, in this response.
	 *
	 *       - `acts-for`: an SD-JWT VC saying the agent acts for the issuer.
	 *       - `tool-scope`: an SD-JWT VC listing the tools the agent may call (`tools`).
	 *       - `mandate`: an AP2 open mandate as an SD-JWT VC, bound to the agent's P-256 key (`mandate`). **Single hop only**: re-delegation to sub-agents is not supported and any such field is refused.
	 *       - `delegation`: a KYA-OS delegation (`scopes`). **Untested** (gate T9) and switched off unless the server sets `ENABLE_KYA_OS_DELEGATIONS`; it has no status list entry, so revoking it does not reach verifiers.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [grantType]
	 *             properties:
	 *               grantType:
	 *                 type: string
	 *                 enum: [acts-for, tool-scope, mandate, delegation]
	 *               issuerDid:
	 *                 type: string
	 *                 description: Defaults to the agent's actsForDid. Must be a DID in your account.
	 *               expiresAt:
	 *                 type: string
	 *                 format: date-time
	 *               tools:
	 *                 type: array
	 *                 items:
	 *                   type: string
	 *               scopes:
	 *                 type: array
	 *                 items:
	 *                   type: string
	 *               mandate:
	 *                 type: object
	 *                 required: [type, constraints]
	 *                 properties:
	 *                   type:
	 *                     type: string
	 *                     enum: [payment, checkout]
	 *                   constraints:
	 *                     type: array
	 *                     description: AP2 constraints, for example payment.amount_range, payment.allowed_payees, payment.budget, payment.agent_recurrence, payment.execution_date, checkout.allowed_merchants, checkout.line_items.
	 *                     items:
	 *                       type: object
	 *     responses:
	 *       201:
	 *         description: The authority was granted.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 grant:
	 *                   $ref: '#/components/schemas/AuthorityGrant'
	 *                 credential:
	 *                   type: object
	 *                   properties:
	 *                     format:
	 *                       type: string
	 *                       enum: [sd-jwt-vc, jwt]
	 *                     value:
	 *                       description: The compact SD-JWT VC (a string), or the credential for a delegation.
	 *                 label:
	 *                   type: string
	 *                   enum: [untested]
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       403:
	 *         description: KYA-OS delegations are switched off.
	 *       404:
	 *         description: No such agent in your account, or issuerDid is not a DID in your account.
	 *       409:
	 *         description: The agent is not active, or the issuer DID is deactivated.
	 *       501:
	 *         description: The identity engine for this account cannot serve the agent endpoints yet. They need the Credo engine.
	 * /agents/{agentId}/authority/{grantId}:
	 *   delete:
	 *     tags: [ Agents ]
	 *     summary: Revoke an authority grant.
	 *     description: Sets the grant's entry in its Token Status List to revoked, then records the revocation. Revoking a revoked grant returns it unchanged.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *       - name: grantId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *     responses:
	 *       200:
	 *         description: The grant was revoked.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/AuthorityGrant'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         description: No such agent or grant in your account.
	 *       501:
	 *         description: The identity engine for this account cannot update status lists yet. It needs the Credo engine.
	 */
	public grantAuthority = async (request: Request, response: Response) => {
		return this.handleIdempotent(request, response, async () => {
			const { grantType, issuerDid, expiresAt, tools, scopes, mandate } = request.body;
			const issued = await (
				await this.services()
			).agents.grantAuthority(
				response.locals.customer,
				request.params.agentId as string,
				{
					grantType: grantType as GrantType,
					issuerDid,
					expiresAt,
					tools,
					scopes,
					mandate,
				},
				callContext(response)
			);
			return {
				status: StatusCodes.CREATED,
				body: {
					grant: grantDto(issued.grant),
					credential: issued.credential,
					...(issued.label ? { label: issued.label } : {}),
				},
			};
		});
	};

	public revokeAuthority = async (request: Request, response: Response) => {
		return this.handleIdempotent(request, response, async () => {
			const grant = await (
				await this.services()
			).agents.revokeAuthority(
				response.locals.customer,
				request.params.agentId as string,
				request.params.grantId as string,
				callContext(response)
			);
			return { status: StatusCodes.OK, body: grantDto(grant) };
		});
	};

	/**
	 * @openapi
	 *
	 * /agents/{agentId}/authority/{grantId}:
	 *   patch:
	 *     tags: [ Agents ]
	 *     summary: Change the expiry of an authority grant.
	 *     description: |
	 *       Changes a grant's expiry without revoking it. Grants are signed credentials, so Studio issues a replacement credential with the new expiry and, in the same operation, revokes the old one on its Token Status List. The grant keeps its `id`. The replacement credential is returned once, in this response. Honours `Idempotency-Key`.
	 *
	 *       Refused with 409 for a grant that is revoked or expired, for a KYA-OS delegation (no status list entry, so the old credential cannot be superseded), and for a tool-scope or mandate grant made before Studio kept its claims. 400 when the new expiry is in the past or later than the platform maximum (365 days from now unless the server sets `AGENT_GRANT_MAX_LIFETIME_DAYS`). Ownership: a grant or agent that is not yours is a 404.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *       - name: grantId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [expiresAt]
	 *             properties:
	 *               expiresAt:
	 *                 type: string
	 *                 format: date-time
	 *     responses:
	 *       200:
	 *         description: The expiry was changed.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 grant:
	 *                   $ref: '#/components/schemas/AuthorityGrant'
	 *                 credential:
	 *                   type: object
	 *                   description: The replacement credential. Returned once.
	 *                   properties:
	 *                     format:
	 *                       type: string
	 *                     value:
	 *                       type: string
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         $ref: '#/components/schemas/NotFoundError'
	 *       409:
	 *         description: The grant is revoked or expired, cannot be superseded, or a change to it is already in progress.
	 *       501:
	 *         description: The identity engine for this account cannot serve the agent endpoints yet. They need the Credo engine.
	 */
	public changeGrantExpiry = async (request: Request, response: Response) => {
		return this.handleIdempotent(request, response, async () => {
			const result = await (
				await this.services()
			).agents.changeGrantExpiry(
				response.locals.customer,
				request.params.agentId as string,
				request.params.grantId as string,
				{ expiresAt: request.body.expiresAt },
				callContext(response)
			);
			return {
				status: StatusCodes.OK,
				body: {
					grant: {
						...grantDto(result.grant),
						status: 'active',
						summary: summariseGrant(result.grant as AuthorityGrantWithStatus),
					},
					credential: result.credential,
				},
			};
		});
	};

	/**
	 * @openapi
	 *
	 * /agents/{agentId}/keys:
	 *   get:
	 *     tags: [ Agents ]
	 *     summary: List the keys of an agent.
	 *     description: Read from the agent's DID document. `active` keys are in force, `rotated` keys stay in the document so earlier credentials still verify, `revoked` is every key of a deactivated DID. `usedBy` says which protocols an active key signs for. Never returns private material.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 keys:
	 *                   type: array
	 *                   items:
	 *                     $ref: '#/components/schemas/AgentKey'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         $ref: '#/components/schemas/NotFoundError'
	 *       502:
	 *         description: The agent's DID could not be resolved.
	 *   post:
	 *     tags: [ Agents ]
	 *     summary: Add an Ed25519 key to an agent.
	 *     description: Adds an Ed25519 key to an agent that has only a P-256 key, and updates the DID document on the ledger (costs CHEQ, paid by your payer account; ledger writes are queued per payer). Honours `Idempotency-Key`. 409 when an active Ed25519 key already exists.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [type]
	 *             properties:
	 *               type:
	 *                 type: string
	 *                 enum: [Ed25519]
	 *     responses:
	 *       201:
	 *         description: The key was added.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/AgentKey'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       402:
	 *         description: The payer account has no CHEQ, or too little to pay the fee.
	 *       404:
	 *         $ref: '#/components/schemas/NotFoundError'
	 *       409:
	 *         description: The agent already has an active Ed25519 key, its DID is deactivated, or a key change is already in progress.
	 *       503:
	 *         description: The payer's write queue is busy. Retry after the time in Retry-After.
	 */
	public listKeys = async (request: Request, response: Response) => {
		return this.handle(request, response, async () => {
			const keys = await (
				await this.services()
			).agents.listKeys(response.locals.customer, request.params.agentId as string);
			return response.status(StatusCodes.OK).json({ keys: keys.map(keyDto) });
		});
	};

	public addKey = async (request: Request, response: Response) => {
		return this.handleIdempotent(request, response, async () => {
			const key = await (
				await this.services()
			).agents.addKey(
				response.locals.customer,
				request.params.agentId as string,
				{ type: request.body.type },
				callContext(response)
			);
			return { status: StatusCodes.CREATED, body: keyDto(key) };
		});
	};

	/**
	 * @openapi
	 *
	 * /agents/{agentId}/keys/rotate:
	 *   post:
	 *     tags: [ Agents ]
	 *     summary: Rotate a key of an agent.
	 *     description: |
	 *       Makes a new key of the same type, updates the DID document on the ledger with the old key signing the update, and marks the old key `rotated`. The old key stays in the document so earlier credentials still verify. Uses your payer account and the per-payer ledger write queue and lock. Honours `Idempotency-Key`. Recorded in the audit log and the agent's activity.
	 *
	 *       Rotation does not reissue authority: a mandate stays bound to the key it was issued for, so grant it again to bind the new key.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [keyId, confirm]
	 *             properties:
	 *               keyId:
	 *                 type: string
	 *                 description: The `keyId` from the key list (a full DID URL; the `#key-1` fragment is also accepted).
	 *               confirm:
	 *                 type: boolean
	 *                 enum: [true]
	 *     responses:
	 *       200:
	 *         description: The key was rotated.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 oldKeyId:
	 *                   type: string
	 *                 newKeyId:
	 *                   type: string
	 *                 didUpdate:
	 *                   type: object
	 *                   properties:
	 *                     txHash:
	 *                       type: string
	 *                       nullable: true
	 *                       description: The ledger transaction hash. Null when the identity engine does not report it (the Credo engine does not yet).
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       402:
	 *         description: The payer account has no CHEQ, or too little to pay the fee.
	 *       404:
	 *         description: No such agent in your account, or the agent has no such key.
	 *       409:
	 *         description: The key is not active, the DID is deactivated, or a rotation is already in progress.
	 *       503:
	 *         description: The payer's write queue is busy. Retry after the time in Retry-After.
	 */
	public rotateKey = async (request: Request, response: Response) => {
		return this.handleIdempotent(request, response, async () => {
			const result = await (
				await this.services()
			).agents.rotateKey(
				response.locals.customer,
				request.params.agentId as string,
				{ keyId: request.body.keyId, confirm: request.body.confirm },
				callContext(response)
			);
			return { status: StatusCodes.OK, body: result };
		});
	};

	/**
	 * @openapi
	 *
	 * /agents/{agentId}/activity:
	 *   get:
	 *     tags: [ Agents ]
	 *     summary: The activity of an agent.
	 *     description: What happened to the agent, newest first. Written by Studio when the change is made, and backfilled for agents that existed before the feed (registration, grants, revocations and cards only). `actor` is `owner`, `api-key` or `system`, never an email. Staff audit data is not part of it.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *       - name: limit
	 *         in: query
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 50
	 *       - name: page
	 *         in: query
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 total:
	 *                   type: integer
	 *                 events:
	 *                   type: array
	 *                   items:
	 *                     $ref: '#/components/schemas/AgentEvent'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         $ref: '#/components/schemas/NotFoundError'
	 */
	public activity = async (request: Request, response: Response) => {
		return this.handle(request, response, async () => {
			const limit = Number(request.query.limit ?? 50);
			const page = Number(request.query.page ?? 1);
			const { total, events } = await (
				await this.services()
			).agents.listActivity(response.locals.customer, request.params.agentId as string, {
				limit,
				offset: (page - 1) * limit,
			});
			return response.status(StatusCodes.OK).json({ total, events: events.map(eventDto) });
		});
	};

	/**
	 * @openapi
	 *
	 * /agents/{agentId}/payment-addresses:
	 *   get:
	 *     tags: [ "Agent payments (Proposed)" ]
	 *     summary: "Proposed: list the payment addresses bound to an agent."
	 *     description: |
	 *       **Proposed.** Lists the agent's payment address bindings, live and revoked, newest first. The credential is never returned here (it is returned once, when the address is bound). An agent that is not yours, or does not exist, is a 404.
	 *
	 *       `PaymentAddressBinding` is cheqd's own vocabulary. It is not an x402 standard.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 paymentAddresses:
	 *                   type: array
	 *                   items:
	 *                     $ref: '#/components/schemas/PaymentAddressBinding'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         description: No such agent in your account. Also returned for an agent that belongs to another account.
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 *   post:
	 *     tags: [ "Agent payments (Proposed)" ]
	 *     summary: "Proposed: bind a payment address to an agent."
	 *     description: |
	 *       **Proposed.** Binds a wallet address, given as a CAIP-10 account such as `eip155:8453:0x...`, to the agent. Studio issues a `PaymentAddressBinding` SD-JWT VC signed by the agent's own key (through the identity engine) with a Token Status List entry, so the binding can be revoked. The credential is returned once, in this response; Studio stores only the binding row, never the credential.
	 *
	 *       `PaymentAddressBinding` is cheqd's own vocabulary. It is **not** an x402 standard. The binding is the agent's assertion about the address: it does not prove that the agent controls the wallet.
	 *
	 *       The address is validated strictly against CAIP-10 and normalised by the chain's rules: EVM (`eip155`) addresses are stored lower case, and a mixed-case address must have a valid EIP-55 checksum. An agent can have at most 10 live bindings, and one account can be bound to an agent once while the binding is not revoked.
	 *
	 *       Send an optional `Idempotency-Key` header: the binding writes a status list entry, so a retry with the same key replays the first response instead of binding twice.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *       - name: Idempotency-Key
	 *         in: header
	 *         required: false
	 *         schema:
	 *           type: string
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [account]
	 *             properties:
	 *               account:
	 *                 type: string
	 *                 description: A CAIP-10 account.
	 *                 example: eip155:8453:0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed
	 *     responses:
	 *       201:
	 *         description: The address was bound.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 paymentAddress:
	 *                   $ref: '#/components/schemas/PaymentAddressBinding'
	 *                 credential:
	 *                   type: object
	 *                   properties:
	 *                     format:
	 *                       type: string
	 *                       enum: [sd-jwt-vc]
	 *                     value:
	 *                       type: string
	 *                       description: The compact SD-JWT VC. Returned once; Studio does not keep it.
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         description: No such agent in your account. Also returned for an agent that belongs to another account.
	 *       409:
	 *         description: The agent is not active, its DID is deactivated, the account is already bound, or the agent already has 10 live bindings.
	 *       501:
	 *         description: The identity engine for this account cannot serve the agent endpoints yet. They need the Credo engine.
	 * /agents/{agentId}/payment-addresses/{bindingId}:
	 *   delete:
	 *     tags: [ "Agent payments (Proposed)" ]
	 *     summary: "Proposed: revoke a payment address binding."
	 *     description: |
	 *       **Proposed.** Sets the binding's entry in its Token Status List to revoked, then records `revokedAt`. Revoking a revoked binding returns it unchanged. Deleting or suspending the agent also takes its bindings out of use: delete revokes them, suspend marks them suspended on their status list and restores them when the agent is made active again. Accept the optional `Idempotency-Key` header for safe retries.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *       - name: bindingId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *       - name: Idempotency-Key
	 *         in: header
	 *         required: false
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: The binding was revoked.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/PaymentAddressBinding'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         description: No such agent or binding in your account.
	 *       501:
	 *         description: The identity engine for this account cannot update status lists yet. It needs the Credo engine.
	 */
	public listPaymentAddresses = async (request: Request, response: Response) => {
		return this.handle(request, response, async () => {
			const paymentAddresses = await (
				await this.services()
			).agents.listPaymentAddresses(response.locals.customer, request.params.agentId as string);
			return response.status(StatusCodes.OK).json({ paymentAddresses });
		});
	};

	public bindPaymentAddress = async (request: Request, response: Response) => {
		return this.handleIdempotent(request, response, async () => {
			const issued = await (
				await this.services()
			).agents.bindPaymentAddress(response.locals.customer, request.params.agentId as string, {
				account: request.body.account,
			});
			return {
				status: StatusCodes.CREATED,
				body: { paymentAddress: bindingDto(issued.binding), credential: issued.credential },
			};
		});
	};

	public revokePaymentAddress = async (request: Request, response: Response) => {
		return this.handleIdempotent(request, response, async () => {
			const binding = await (
				await this.services()
			).agents.revokePaymentAddress(
				response.locals.customer,
				request.params.agentId as string,
				request.params.bindingId as string
			);
			return { status: StatusCodes.OK, body: bindingDto(binding) };
		});
	};

	/**
	 * @openapi
	 *
	 * /agents/{agentId}/settlement:
	 *   get:
	 *     tags: [ "Agent payments (Proposed)" ]
	 *     summary: "Proposed: read the agent's open payment mandate as an x402 payment policy."
	 *     description: |
	 *       **Proposed. Read-only.** Shows the agent's open AP2 payment mandate as an x402 payment policy: the cap per payment, the budget, how often it repeats, the allowed payees, and the addresses the agent may pay from (its live payment address bindings). Nothing here changes the mandate or moves money.
	 *
	 *       Studio does not keep the signed mandate (it is returned once). The view is derived from a non-secret summary kept when the mandate was granted (caps, payees, recurrence, window) and from the live bindings. Mandates granted before the summary was kept are not shown. **Single hop only**: there are no re-delegation fields. AP2 amounts are in a fiat currency; no mapping to an x402 asset is made. The vocabulary is cheqd's own, not an x402 standard.
	 *
	 *       A suspended agent shows the mandate with an empty `payFrom`.
	 *     parameters:
	 *       - name: agentId
	 *         in: path
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 label:
	 *                   type: string
	 *                   enum: [Proposed]
	 *                 readOnly:
	 *                   type: boolean
	 *                 note:
	 *                   type: string
	 *                 agentId:
	 *                   type: string
	 *                   format: uuid
	 *                 agentStatus:
	 *                   type: string
	 *                 mandate:
	 *                   type: object
	 *                   properties:
	 *                     id:
	 *                       type: string
	 *                       format: uuid
	 *                       description: The id of the mandate's authority grant.
	 *                     type:
	 *                       type: string
	 *                       enum: [payment]
	 *                     issuedAt:
	 *                       type: string
	 *                       format: date-time
	 *                     expiresAt:
	 *                       type: string
	 *                       format: date-time
	 *                       nullable: true
	 *                 policy:
	 *                   type: object
	 *                   properties:
	 *                     capPerPayment:
	 *                       type: object
	 *                       nullable: true
	 *                       properties:
	 *                         currency:
	 *                           type: string
	 *                         max:
	 *                           type: integer
	 *                         min:
	 *                           type: integer
	 *                           nullable: true
	 *                         unit:
	 *                           type: string
	 *                           enum: [minor]
	 *                     budget:
	 *                       type: object
	 *                       nullable: true
	 *                       properties:
	 *                         currency:
	 *                           type: string
	 *                         max:
	 *                           type: number
	 *                         unit:
	 *                           type: string
	 *                           enum: [major]
	 *                     repeats:
	 *                       type: object
	 *                       nullable: true
	 *                       properties:
	 *                         frequency:
	 *                           type: string
	 *                         maxOccurrences:
	 *                           type: integer
	 *                           nullable: true
	 *                     payees:
	 *                       type: array
	 *                       nullable: true
	 *                       items:
	 *                         type: string
	 *                     window:
	 *                       type: object
	 *                       nullable: true
	 *                       properties:
	 *                         notBefore:
	 *                           type: string
	 *                           nullable: true
	 *                         notAfter:
	 *                           type: string
	 *                           nullable: true
	 *                 payFrom:
	 *                   type: array
	 *                   items:
	 *                     type: object
	 *                     properties:
	 *                       bindingId:
	 *                         type: string
	 *                         format: uuid
	 *                       account:
	 *                         type: string
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         description: No such agent in your account, or the agent has no open payment mandate.
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public settlement = async (request: Request, response: Response) => {
		return this.handle(request, response, async () => {
			const view = await (
				await this.services()
			).agents.settlement(response.locals.customer, request.params.agentId as string);
			return response.status(StatusCodes.OK).json(view);
		});
	};

	/**
	 * Like `handle`, for the ledger-writing operations. `run` returns the status and body instead of sending them.
	 * With an `Idempotency-Key` header the write happens at most once for that key (engine spec 3.4); without one
	 * it is the same as `handle`.
	 */
	private async handleIdempotent(
		request: Request,
		response: Response,
		run: () => Promise<IdempotentResult>
	): Promise<Response> {
		const invalid = validationResult(request);
		if (!invalid.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: invalid.array().pop()?.msg });
		}
		try {
			const header = request.headers?.['idempotency-key'];
			const key = Array.isArray(header) ? header[0] : header;
			const customerId = response.locals.customer?.customerId as string | undefined;
			if (!key || !customerId) {
				const result = await run();
				return response.status(result.status).json(result.body);
			}
			const route = `${request.method} ${request.route?.path ?? request.path ?? ''}`;
			const outcome = await (
				await this.idempotency()
			).execute(
				{
					customerId,
					key,
					route,
					requestHash: hashRequest({ route, params: request.params, body: request.body }),
				},
				run
			);
			if (outcome.replayed) response.setHeader?.('Idempotent-Replayed', 'true');
			return response.status(outcome.result.status).json(outcome.result.body);
		} catch (error) {
			return this.fail(response, error);
		}
	}

	private fail(response: Response, error: unknown): Response {
		if (error instanceof IdempotencyError) {
			return response.status(error.status).json({
				error: error.message,
				code: error.code,
				...(error.idempotencyKey ? { idempotencyKey: error.idempotencyKey } : {}),
			});
		}
		if (error instanceof LedgerUnavailableError) {
			response.setHeader?.('Retry-After', String(error.retryAfterSeconds));
			return response.status(StatusCodes.SERVICE_UNAVAILABLE).json({
				error: error.message,
				code: error.code,
				...(error.idempotencyKey ? { idempotencyKey: error.idempotencyKey } : {}),
			});
		}
		if (error instanceof AgentServiceError) {
			return response.status(error.status).json({ error: error.message, code: error.code });
		}
		const unfunded = unfundedPayerFailure(error);
		if (unfunded) return response.status(unfunded.status).json({ error: unfunded.error });
		console.error('Agent endpoint failed:', error);
		return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'Internal error' });
	}

	/** Validation, then the handler; every service error becomes its status, anything else a 500 that leaks nothing. */
	private async handle(request: Request, response: Response, run: () => Promise<Response>): Promise<Response> {
		const invalid = validationResult(request);
		if (!invalid.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: invalid.array().pop()?.msg });
		}
		try {
			return await run();
		} catch (error) {
			return this.fail(response, error);
		}
	}
}

/** The production idempotency service, on the TypeORM store. Imported on first use so tests need no database. */
let idempotencyService: IdempotencyService | undefined;
async function defaultIdempotency(): Promise<IdempotencyService> {
	if (!idempotencyService) {
		const { TypeormIdempotencyStore } = await import('../../services/idempotency/typeorm-idempotency-store.js');
		idempotencyService = new IdempotencyService({ store: new TypeormIdempotencyStore() });
	}
	return idempotencyService;
}
