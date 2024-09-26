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
import { body, param } from '../validator/index.js';

export class AccreditationController {
	public static issueValidator = [
		param('accreditationType').exists().isString().isIn(['authorize', 'accredit', 'attest']).bail(),
		body('issuerDid').exists().isString().isDID().bail(),
		body('subjectDid').exists().isString().isDID().bail(),
		body('schemas').exists().isArray().bail(),
		body('schemas.*.url').isURL().bail(),
		body('schemas.*.type').isArray().bail(),
		body('schemas.*.type.*').isString().bail(),
		body('parentAccreditation').optional().isURL().bail(),
		body('rootAuthorisation').optional().isURL().bail(),
		param('accreditationType')
			.custom((value, { req }) => {
				if (value === 'accredit' || value === 'attest') {
					return req.body.parentAccreditation && req.body.rootAuthorisation;
				}

				return true;
			})
			.bail(),
		body('accreditationName').isString(),
	];

	public static verifyValidator = [body('accreditation').exists().bail()];

	/**
	 * @openapi
	 *
	 * /accreditation/issue:
	 *   post:
	 *     tags: [ Trust Registry ]
	 *     summary: Publish a verifiable accreditation for a DID.
	 *     description: Generate and publish a verifiable accreditation for a subject DID accrediting schema's as a DID Linked resource.
	 *     operationId: accredit-issue
	 *     parameters:
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
	 *             $ref: '#/components/schemas/AccreditationIssueRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/AccreditationIssueRequest'
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
		const { accreditationType } = request.query as DIDAccreditationRequestParams;

		// Handles string input instead of an array
		if (typeof request.body.type === 'string') {
			request.body.type = [request.body.type];
		}
		if (typeof request.body['@context'] === 'string') {
			request.body['@context'] = [request.body['@context']];
		}

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
				credentialName: accreditationName,
			};
			switch (accreditationType) {
				case AccreditationRequestType.authroize:
					credentialRequest.type = [
						...(type || []),
						DIDAccreditationTypes.VerifiableAuthorisationForTrustChain,
					];
					credentialRequest.termsOfUse = {
						type: DIDAccreditationTypes.VerifiableAuthorisationForTrustChain,
						trustFramework: 'cheqd Governance Framework',
						trustFrameworkId: 'https://learn.cheqd.io/governance/start',
					};
					break;
				case AccreditationRequestType.accredit:
					credentialRequest.type = [...(type || []), DIDAccreditationTypes.VerifiableAccreditationToAccredit];
					credentialRequest.termsOfUse = {
						type: DIDAccreditationTypes.VerifiableAccreditationToAccredit,
						parentAccreditation,
						rootAuthorisation,
					};
					break;
				case AccreditationRequestType.attest:
					credentialRequest.type = [...(type || []), DIDAccreditationTypes.VerifiableAccreditationToAttest];
					credentialRequest.termsOfUse = {
						type: DIDAccreditationTypes.VerifiableAccreditationToAttest,
						parentAccreditation,
						rootAuthorisation,
					};
			}

			// issue accreditation
			const accreditation: VerifiableCredential = await Credentials.instance.issue_credential(
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
				accreditation,
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
	 * /accreditation/verify:
	 *   post:
	 *     tags: [ Trust Registry ]
	 *     summary: Verify a verifiable accreditation for a DID.
	 *     description: Generate and publish a verifiable accreditation for a subject DID accrediting schema's as a DID Linked resource.
	 *     operationId: accredit-verify
	 *     parameters:
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
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/AccreditationVerifyRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/AccreditationVerifyRequest'
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
		const { verifyStatus = false, allowDeactivatedDid = false } = request.query as VerifyCredentialRequestQuery;
		const { accreditation, policies } = request.body;
		try {
			const result = await AccreditationService.instance.verify_accreditation(
				accreditation,
				verifyStatus,
				allowDeactivatedDid,
				response.locals.customer,
				policies
			);
			// Track operation
			const trackInfo = {
				category: OperationCategoryNameEnum.CREDENTIAL,
				name: OperationNameEnum.CREDENTIAL_VERIFY,
				customer: response.locals.customer,
				user: response.locals.user,
				data: {
					did: accreditation.split('/')[0],
				} satisfies ICredentialTrack,
			} as ITrackOperation;

			eventTracker.emit('track', trackInfo);
			if (result.success) {
				return response.status(StatusCodes.OK).json(result.data);
			} else {
				return response.status(result.status).json({ verified: false, error: result.error });
			}
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}
}
