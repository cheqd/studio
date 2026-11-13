import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { body, param, query, validationResult } from '../validator/index.js';
import { AgentServiceError, agentServices } from '../../services/agent/index.js';
import type { AgentServices } from '../../services/agent/index.js';
import { unfundedPayerFailure } from '../../helpers/ledger-errors.js';
import { LedgerUnavailableError } from '../../services/identity/ledger-lock.js';
import { IdempotencyError, IdempotencyService, hashRequest } from '../../services/idempotency/idempotency.js';
import type { IdempotentResult } from '../../services/idempotency/idempotency.js';
import { AGENT_NETWORKS, AGENT_SETTABLE_STATUSES, GRANT_TYPES } from '../../types/agent.js';
import type { AgentCardRecord, AgentNetwork, AgentRecord, AuthorityGrantRecord, GrantType } from '../../types/agent.js';

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
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
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
 */

const agentDto = (agent: AgentRecord) => ({
	agentId: agent.agentId,
	did: agent.did,
	name: agent.name,
	description: agent.description ?? null,
	actsForDid: agent.actsForDid ?? null,
	status: agent.status,
	createdAt: agent.createdAt,
	updatedAt: agent.updatedAt,
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
	];

	public static listValidator = [
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

	public static revokeValidator = [
		param('agentId').isUUID().withMessage('agentId must be a UUID').bail(),
		param('grantId').isUUID().withMessage('grantId must be a UUID').bail(),
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
	 *     parameters:
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
			const { name, description, network, actsForDid } = request.body;
			const agent = await (
				await this.services()
			).agents.register(response.locals.customer, {
				name,
				description,
				network: (network ?? 'testnet') as AgentNetwork,
				actsForDid,
			});
			return { status: StatusCodes.CREATED, body: agentDto(agent) };
		});
	};

	public list = async (request: Request, response: Response) => {
		return this.handle(request, response, async () => {
			const limit = Number(request.query.limit ?? 50);
			const page = Number(request.query.page ?? 1);
			const { items, total } = await (
				await this.services()
			).agents.list(response.locals.customer, {
				limit,
				offset: (page - 1) * limit,
			});
			return response.status(StatusCodes.OK).json({ total, agents: items.map(agentDto) });
		});
	};

	/**
	 * @openapi
	 *
	 * /agents/{agentId}:
	 *   get:
	 *     tags: [ Agents ]
	 *     summary: Get an agent.
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
	 *               $ref: '#/components/schemas/Agent'
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
	 *     description: Revokes every live authority grant of the agent, then removes the agent (soft delete; the DID stays on the ledger). If a grant cannot be revoked the agent is not deleted.
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
			const agent = await (
				await this.services()
			).agents.get(response.locals.customer, request.params.agentId as string);
			return response.status(StatusCodes.OK).json(agentDto(agent));
		});
	};

	public update = async (request: Request, response: Response) => {
		return this.handle(request, response, async () => {
			const { name, description, actsForDid, status } = request.body;
			const agent = await (
				await this.services()
			).agents.update(response.locals.customer, request.params.agentId as string, {
				name,
				description,
				actsForDid,
				status,
			});
			return response.status(StatusCodes.OK).json(agentDto(agent));
		});
	};

	public remove = async (request: Request, response: Response) => {
		return this.handleIdempotent(request, response, async () => {
			const { revokedGrants } = await (
				await this.services()
			).agents.remove(response.locals.customer, request.params.agentId as string);
			return { status: StatusCodes.OK, body: { deleted: true, revokedGrants } };
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
			).agents.createCard(response.locals.customer, request.params.agentId as string, {
				card,
				publish: publish === true || publish === 'true',
				alg,
			});
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
			).agents.grantAuthority(response.locals.customer, request.params.agentId as string, {
				grantType: grantType as GrantType,
				issuerDid,
				expiresAt,
				tools,
				scopes,
				mandate,
			});
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
				request.params.grantId as string
			);
			return { status: StatusCodes.OK, body: grantDto(grant) };
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
