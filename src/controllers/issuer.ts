import type { Request, Response } from 'express'
import { check, param, validationResult } from 'express-validator'
import { fromString } from 'uint8arrays'
import { DIDDocument, Service, VerificationMethod } from 'did-resolver'
import { v4 } from 'uuid'
import { MethodSpecificIdAlgo, VerificationMethods, CheqdNetwork } from '@cheqd/sdk'
import { MsgCreateResourcePayload } from '@cheqd/ts-proto/cheqd/resource/v2/index.js'

import { Identity } from '../services/identity/index.js'
import { generateDidDoc, isValidService, isValidVerificationMethod, validateSpecCompliantPayload } from '../helpers/helpers.js'

export class IssuerController {

  public static createValidator = [
    check('didDocument').optional().isObject().custom((value)=>{
      const { valid } = validateSpecCompliantPayload(value)
      return valid
    }).withMessage('Invalid didDocument'),
    check('verificationMethodType')
      .optional()
      .isString()
      .isIn([VerificationMethods.Ed255192020, VerificationMethods.Ed255192018, VerificationMethods.JWK])
      .withMessage('Invalid verificationMethod'),    
    check('methodSpecificIdAlgo').optional().isString().isIn([MethodSpecificIdAlgo.Base58, MethodSpecificIdAlgo.Uuid]).withMessage('Invalid methodSpecificIdAlgo'),
    check('network').optional().isString().isIn([CheqdNetwork.Mainnet, CheqdNetwork.Testnet]).withMessage('Invalid network'),
  ]

  public static updateValidator = [
    check('didDocument').custom((value, {req})=>{
        if(value) {
            const { valid } = validateSpecCompliantPayload(value)
            return valid
        } else {
            const { did, service, verificationMethod, authentication } = req.body
            return did && (service || verificationMethod || authentication )
        }
      }).withMessage('Provide a valid DIDDocument or a DID and atleast one field to update')
  ]

  public static deactivateValidator = [
    param('did').exists().isString().contains('did:cheqd').withMessage('Invalid DID')
  ]

  public static resourceValidator = [
    param('did').exists().isString().contains('did:cheqd').withMessage('Invalid DID'),
    check('name').exists().withMessage('name is required').isString().withMessage('Invalid name'),
    check('type').exists().withMessage('type is required').isString().withMessage('Invalid type'),
    check('data').exists().withMessage('data is required').isString().withMessage('Invalid data'),
    check('encoding').exists().withMessage('encoding is required')
    .isString().isIn(['hex', 'base64', 'base64url']).withMessage('Invalid encoding'),
    check('alsoKnownAs').optional().isArray().withMessage('Invalid alsoKnownAs'),
    check('alsoKnownAs.*.uri').isString().withMessage('Invalid uri'),
    check('alsoKnownAs.*.description').isString().withMessage('Invalid description')
  ]
  
  /**
   * @openapi
   * 
   * /key/create:
   *   post:
   *     tags: [ Key ]
   *     summary: Create a key pair.
   *     security: [ bearerAuth: [] ]
   *     responses:
   *       200:
   *         description: The request was successful.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/KeyResult'
   *       400:
   *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example:
   *               error: Invalid Request
   *       401:
   *         $ref: '#/components/schemas/UnauthorizedError'
   *       500:
   *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example: 
   *               error: Internal Error
   */
  public async createKey(request: Request, response: Response) {
    try {
      const key = await Identity.instance.createKey('Ed25519', response.locals.customerId)
      return response.status(200).json(key)
    } catch (error) {
        return response.status(500).json({
            error: `${error}`
        })
    }
  }

  /**
   * @openapi
   * 
   * /key/{kid}:
   *   get:
   *     tags: [ Key ]
   *     summary: Fetch a key pair.
   *     security: [ bearerAuth: [] ]
   *     parameters:
   *       - name: kid
   *         in: path
   *         schema:
   *           type: string
   *         required: true
   *     responses:
   *       200:
   *         description: The request was successful.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/KeyResult'
   *       400:
   *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example:
   *               error: Invalid Request
   *       401:
   *         $ref: '#/components/schemas/UnauthorizedError'
   *       500:
   *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example: 
   *               error: Internal Error
   */
  public async getKey(request: Request, response: Response) {
    try {
      const key = await Identity.instance.getKey(request.params.kid, response.locals.customerId)
      return response.status(200).json(key)
    } catch (error) {
        return response.status(500).json({
            error: `${error}`
        })
    }
  }

  /**
   * @openapi
   * 
   * /did/create:
   *   post:
   *     tags: [ DID ]
   *     summary: Create a DID.
   *     description: This endpoint creates a DID by taking a set of input parameters or the whole didDocument itself.
   *     security: [ bearerAuth: [] ]
   *     requestBody:
   *       content:
   *         application/x-www-form-urlencoded:
   *           schema:
   *             $ref: '#/components/schemas/DidCreateRequest'
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/DidCreateRequest'
   *     responses:
   *       200:
   *         description: The request was successful.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/DidResult'
   *       400:
   *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example:
   *               error: Invalid Request
   *       401:
   *         $ref: '#/components/schemas/UnauthorizedError'
   *       500:
   *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example: 
   *               error: Internal Error
   */
  public async createDid(request: Request, response: Response) {
    const result = validationResult(request)
    if (!result.isEmpty()) {
      return response.status(400).json({
        error: result.array()[0].msg
      })
    }

    const { methodSpecificIdAlgo, network, verificationMethodType, assertionMethod=true, serviceEndpoint } = request.body
    let didDocument: DIDDocument
    try {
      if (request.body.didDocument) {
        didDocument = request.body.didDocument
      } else if (verificationMethodType) {
        const key = await Identity.instance.createKey('Ed25519', response.locals.customerId)
        didDocument = generateDidDoc({
          verificationMethod: verificationMethodType || VerificationMethods.Ed255192018,
          verificationMethodId: 'key-1',
          methodSpecificIdAlgo: (methodSpecificIdAlgo as MethodSpecificIdAlgo) || MethodSpecificIdAlgo.Uuid,
          network,
          publicKey: key.publicKeyHex
        })

        if (assertionMethod) {
          didDocument.assertionMethod = didDocument.authentication
        }

        if (serviceEndpoint) {
            didDocument.service = [{
                id: `${didDocument.id}#service-1`,
                type: 'service-1',
                serviceEndpoint: [serviceEndpoint]
            }]
        }
      } else {
        return response.status(400).json({
            error: 'Provide a DID Document or the network type to create a DID'
        })
      }

      const did = await Identity.instance.createDid(network || didDocument.id.split(':')[2], didDocument, response.locals.customerId)
      return response.status(200).json(did)
    } catch (error) {
        return response.status(500).json({
            error: `${error}`
        })
    }
  }

  /**
   * @openapi
   * 
   * /did/update:
   *   post:
   *     tags: [ DID ]
   *     summary: Update a DID.
   *     description: This endpoint updates a DID by taking DID document or the particular fields needed to be updated.
   *     security: [ bearerAuth: [] ]
   *     requestBody:
   *       content:
   *         application/x-www-form-urlencoded:
   *           schema:
   *             $ref: '#/components/schemas/DidUpdateRequest'
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/DidUpdateRequest'
   *     responses:
   *       200:
   *         description: The request was successful.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/DidResult'
   *       400:
   *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example:
   *               error: Invalid Request
   *       401:
   *         $ref: '#/components/schemas/UnauthorizedError'
   *       500:
   *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example: 
   *               error: Internal Error
   */
  public async updateDid(request: Request, response: Response) {
    const result = validationResult(request)
    if (!result.isEmpty()) {
      return response.status(400).json({
        error: result.array()[0].msg
      })
    }

    try {

      const { did, service, verificationMethod, authentication } = request.body as { did: string, service: Service[], verificationMethod: VerificationMethod[], authentication: string[] }
      let updatedDocument: DIDDocument
      if (request.body.didDocument) {
        updatedDocument = request.body.didDocument
      } else if (did && (service || verificationMethod || authentication)) {
        let resolvedResult = await Identity.instance.resolveDid(did)
        if(!resolvedResult?.didDocument || resolvedResult.didDocumentMetadata.deactivated) {
          return response.status(400).send({
              error: `${did} is either Deactivated or Not found`
          })
        }
        const resolvedDocument = resolvedResult.didDocument
        if (service) {
            resolvedDocument.service = Array.isArray(service) ? service : [service]
        }
        if (verificationMethod) {
            resolvedDocument.verificationMethod = Array.isArray(verificationMethod) ? verificationMethod : [verificationMethod]
        }
        if (authentication) {
            resolvedDocument.authentication = Array.isArray(authentication) ? authentication : [authentication]
        }

        updatedDocument = resolvedDocument
      } else {
        return response.status(400).json({
            error: 'Provide a DID Document or atleast one field to update'
        })
      }

      const result = await Identity.instance.updateDid(updatedDocument, response.locals.customerId)
      return response.status(200).json(result)
    } catch (error) {
        return response.status(500).json({
            error: `${error}`
        })
    }
  }

  /**
   * @openapi
   * 
   * /did/deactivate/{did}:
   *   post:
   *     tags: [ DID ]
   *     summary: Deactivate a DID.
   *     description: This endpoint deactivates a DID by taking DID document or a verification method as an input.
   *     security: [ bearerAuth: [] ]
   *     parameters:
   *       - in: path
   *         name: did
   *         schema:
   *           type: string
   *         required: true
   *     responses:
   *       200:
   *         description: The request was successful.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/DidResult'
   *       400:
   *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example:
   *               error: Invalid Request
   *       401:
   *         $ref: '#/components/schemas/UnauthorizedError'
   *       500:
   *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example: 
   *               error: Internal Error
   */
  public async deactivateDid(request: Request, response: Response) {
    const result = validationResult(request)
    if (!result.isEmpty()) {
      return response.status(400).json({
        error: result.array()[0].msg
      })
    }

    try {
      const did = await Identity.instance.deactivateDid(request.params.did, response.locals.customerId)
      return response.status(200).json(did)
    } catch (error) {
        return response.status(500).json({
            error: `${error}`
        })
    }
  }

  /**
   * @openapi
   * 
   * /resource/create/{did}:
   *   post:
   *     tags: [ Resource ]
   *     summary: Create a Resource.
   *     parameters:
   *       - in: path
   *         name: did
   *         schema:
   *           type: string
   *         required: true
   *     requestBody:
   *       content:
   *         application/x-www-form-urlencoded:
   *             schema:
   *               $ref: '#/components/schemas/CreateResourceRequest'
   *         application/json:
   *             schema:
   *               $ref: '#/components/schemas/CreateResourceRequest'
   *     responses:
   *       200:
   *         description: The request was successful.
   *       400:
   *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example:
   *               error: Invalid Request
   *       401:
   *         $ref: '#/components/schemas/UnauthorizedError'
   *       500:
   *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example: 
   *               error: Internal Error
   */
  public async createResource(request: Request, response: Response) {
    const result = validationResult(request)
    if (!result.isEmpty()) {
      return response.status(400).json({
        error: result.array()[0].msg
      })
    }

    const { did } = request.params
    let { data, encoding, name, type, alsoKnownAs, version, network } = request.body
    
    let resourcePayload: Partial<MsgCreateResourcePayload> = {}
    try {
      // check if did is registered on the ledger
      let resolvedDocument: any = await Identity.instance.resolveDid(did)
      if(!resolvedDocument?.didDocument || resolvedDocument.didDocumentMetadata.deactivated) {
        return response.status(400).send({
            error: `${did} is a either Deactivated or Not found`
        })
      } else {
        resolvedDocument = resolvedDocument.didDocument
      }
      
      resourcePayload = {
        collectionId: did.split(':').pop()!,
        id: v4(),
        name,
        resourceType: type,
        data: fromString(data, encoding),
        version,
        alsoKnownAs
      }
      network = network || (did.split(':'))[2]
      const result = await Identity.instance.createResource( network, resourcePayload, response.locals.customerId)    
      if ( result ) {
        return response.status(201).json({
            resource: resourcePayload
        })
      } else {
        return response.status(500).json({
            error: 'Error creating resource'
        })
      }
    } catch (error) {
      return response.status(500).json({
        error: `${error}`
      })
    }
  }

  /**
   * @openapi
   * 
   * /did/list:
   *   get:
   *     tags: [ DID ]
   *     summary: Fetch DIDs from wallet.
   *     description: This endpoint returns the list of DIDs controlled by the account.
   *     security: [ bearerAuth: [] ]
   *     responses:
   *       200:
   *         description: The request was successful.
   *         content:
   *           application/json:
   *             schema: 
   *               type: array
   *               items:
   *                 type: string
   *       400:
   *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example:
   *               error: Invalid Request
   *       401:
   *         $ref: '#/components/schemas/UnauthorizedError'
   *       500:
   *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example: 
   *               error: Internal Error
   */
  public async getDids(request: Request, response: Response) {
    try {
      let did: any
      if(request.params.did) {
        did = await Identity.instance.resolveDid(request.params.did)
      } else {
        did = await Identity.instance.listDids(response.locals.customerId)
      }

      return response.status(200).json(did)
    } catch (error) {
        return response.status(500).json({
            error: `${error}`
        })
    }
  }

  /**
   * @openapi
   * 
   * /did/{did}:
   *   get:
   *     tags: [ DID ]
   *     summary: Resolve a DID.
   *     description: This endpoint resolved a DID.
   *     parameters:
   *       - in: path
   *         name: did
   *         schema:
   *           type: string
   *         required: true
   *     responses:
   *       200:
   *         description: The request was successful.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/DidDocument'
   *       400:
   *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema: 
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example:
   *               error: Invalid Request
   *       401:
   *         $ref: '#/components/schemas/UnauthorizedError'
   *       500:
   *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/InvalidRequest'
   *             example: 
   *               error: Internal Error
   */
  public async getDid(request: Request, response: Response) {
    try {
      let did: any
      if(request.params.did) {
        did = await Identity.instance.resolveDid(request.params.did)
        return response.status(200).json(did)
      }
    } catch (error) {
        return response.status(500).json({
            error: `${error}`
        })
    }
  }
}

