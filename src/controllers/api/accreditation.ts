import type { Request, Response } from 'express';
import type { VerifiableCredential } from '@veramo/core';
import type { DIDAccreditationRequestBody, DIDAccreditationRequestParams } from '../../types/accreditation.js';
import type { ICredentialTrack, ITrackOperation } from '../../types/track.js';
import type { CredentialRequest } from '../../types/credential.js';
import { StatusCodes } from 'http-status-codes';
import { v4 } from 'uuid';
import { AccreditationRequestType, DIDAccreditationTypes } from '../../types/accreditation.js';
import { CredentialConnectors, VerifyCredentialRequestQuery } from '../../types/credential.js';
import { OperationCategoryNameEnum, OperationNameEnum } from '../../types/constants.js';
import { IdentityServiceStrategySetup } from '../../services/identity/index.js';
import { AccreditationService } from '../../services/api/accreditation.js';
import { Credentials } from '../../services/api/credentials.js';
import { eventTracker } from '../../services/track/tracker.js';
import { getQueryParams } from '../../helpers/helpers.js';
import { body, param } from '../validator/index.js';

export class AccreditationController {
	public static issueValidator = [
		param('did').exists().isString().isDID().bail(),
		param('type').exists().isString().isIn(['authorize', 'accredit', 'attest']).bail(),
		body('subjectDid').exists().isString().isDID().bail(),
		body('schemas').exists().isArray().bail(),
		body('schemas.*.url').isURL().bail(),
		body('schemas.*.type').isArray().bail(),
		body('schemas.*.type.*').isString().bail(),
		body('parentAccreditation').optional().isURL().bail(),
		body('rootAuthorisation').optional().isURL().bail(),
		body('type').custom((value, { req }) => {
			if (value === 'accredit' || value === 'attest') {
				return req.body.parentAccreditation && req.body.rootAuthorisation;
			}

			return true;
		}),
	];

	public static verifyValidator = [param('did').exists().isString().isDID().bail()];

	/**
	 * @openapi
	 *
	 * /accreditation/issue:
	 *   post:
	 *     tags: [ Trust Registry ]
	 *     summary: Publish a verifiable accreditation for a DID.
	 *     description: Generate and publish a verifiable accreditation for a subject DID accrediting schema's as a DID Linked resource.
	 *     operationId: accredit
	 *     parameters:
	 *       - in: path
	 *         name: did
	 *         description: DID identifier of the Accreditor.
	 *         schema:
	 *           type: string
	 *         required: true
	 *       - in: query
	 *         name: type
	 *         description: Select the type of accreditation to be issued.
	 *         schema:
	 *           type: string
	 *           enum:
	 *              - authorize
	 *              - accredit
	 *              - attest
	 *         required: true
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/DIDAccreditationRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/DIDAccreditationRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Credential'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async issue(request: Request, response: Response) {
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup();
		// Extract did from params
		const { accreditationType } = request.params as DIDAccreditationRequestParams;
		const {
			issuerDid,
			subjectDid,
			schemas,
			type,
			parentAccreditation,
			rootAuthorisation,
			attributes,
			accreditationName,
		} = request.body as DIDAccreditationRequestBody;

		try {
			// Validte issuer DID
			const resolvedResult = await identityServiceStrategySetup.agent.resolve(issuerDid);
			// check if DID-Document is resolved
			const body = await resolvedResult.json();
			if (!body?.didDocument) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `DID ${issuerDid} is not resolved because of error from resolver: ${body.didResolutionMetadata.error}.`,
				});
			}
			if (body.didDocumentMetadata.deactivated) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `${issuerDid} is deactivated`,
				});
			}

			// Validate subject DID
			const res = await identityServiceStrategySetup.agent.resolve(subjectDid);
			const subjectDidRes = await res.json();
			if (!subjectDidRes?.didDocument) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `DID ${subjectDid} is not resolved because of error from resolver: ${body.didResolutionMetadata.error}.`,
				});
			}
			if (subjectDidRes.didDocumentMetadata.deactivated) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `${subjectDid} is deactivated`,
				});
			}

			const resourceId = v4();
			// construct credential request
			const credentialRequest: CredentialRequest = {
				subjectDid,
				attributes: {
					...attributes,
					accreditedFor: schemas.map(({ url, type }: any) => ({
						schemaId: url,
						type,
					})),
					id: subjectDid,
				},
				issuerDid,
				format: 'jwt',
				connector: CredentialConnectors.Resource, // resource connector
				credentialId: resourceId,
				accreditationName,
			};
			switch (accreditationType) {
				case AccreditationRequestType.authroize:
					credentialRequest.type = [DIDAccreditationTypes.VerifiableAuthorisationForTrustChain];
					credentialRequest.termsOfUse = {
						type,
						trustFramework: 'cheqd Governance Framework',
						trustFrameworkId: 'https://learn.cheqd.io/governance/start',
					};
					break;
				case AccreditationRequestType.accredit:
					credentialRequest.type = [DIDAccreditationTypes.VerifiableAccreditationToAccredit];
					credentialRequest.termsOfUse = {
						type,
						parentAccreditation,
						rootAuthorisation,
					};
					break;
				case AccreditationRequestType.attest:
					credentialRequest.type = [DIDAccreditationTypes.VerifiableAccreditationToAttest];
					credentialRequest.termsOfUse = {
						type,
						parentAccreditation,
						rootAuthorisation,
					};
			}

			// issue credential
			const credential: VerifiableCredential = await Credentials.instance.issue_credential(
				credentialRequest,
				response.locals.customer
			);

			// Track operation
			const trackInfo = {
				category: OperationCategoryNameEnum.CREDENTIAL,
				name: OperationNameEnum.CREDENTIAL_ISSUE,
				customer: response.locals.customer,
				user: response.locals.user,
				data: {
					did: issuerDid,
				} satisfies ICredentialTrack,
			} as ITrackOperation;

			eventTracker.emit('track', trackInfo);

			return response.status(StatusCodes.OK).json({
				didUrls: [
					`${issuerDid}/resources/${resourceId}`,
					`${issuerDid}?resourceName=${accreditationName}&resourceType=${credentialRequest.type}`,
				],
				credential,
			});
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /accreditation/verify/{:did}:
	 *   post:
	 *     tags: [ Trust Registry ]
	 *     summary: Verify a verifiable accreditation for a DID.
	 *     description: Generate and publish a verifiable accreditation for a subject DID accrediting schema's as a DID Linked resource.
	 *     operationId: accredit
	 *     parameters:
	 *       - in: path
	 *         name: did
	 *         description: DID Url of the Accreditation resource.
	 *         schema:
	 *           type: string
	 *         required: true
	 *       - in: query
	 *         name: verifyStatus
	 *         description: If set to `true` the verification will also check the status of the accreditation. Requires the VC to have a `credentialStatus` property.
	 *         schema:
	 *           type: boolean
	 *           default: false
	 *       - in: query
	 *         name: allowDeactivatedDid
	 *         description: If set to `true` allow to verify accreditation which based on deactivated DID.
	 *         schema:
	 *           type: boolean
	 *           default: false
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Credential'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async verify(request: Request, response: Response) {
		// Extract did from params
		const { did } = request.params;
		const { verifyStatus, allowDeactivatedDid } = request.query as VerifyCredentialRequestQuery;

		try {
			const didUrl = request.params.did + getQueryParams(request.query);

			const result = await AccreditationService.instance.verify_accreditation(
				didUrl,
				verifyStatus || true,
				allowDeactivatedDid || false,
				response.locals.customer
			);
			// Track operation
			const trackInfo = {
				category: OperationCategoryNameEnum.CREDENTIAL,
				name: OperationNameEnum.CREDENTIAL_VERIFY,
				customer: response.locals.customer,
				user: response.locals.user,
				data: {
					did,
				} satisfies ICredentialTrack,
			} as ITrackOperation;

			eventTracker.emit('track', trackInfo);
			if (result.success) {
				return response.status(StatusCodes.OK).json(result.data);
			} else {
				return response.status(result.status).json(result.error);
			}
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}
}
