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
            console.log('value', value)
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

  public async updateDid(request: Request, response: Response) {
    const result = validationResult(request)
    if (!result.isEmpty()) {
      return response.status(400).json({
        error: result.array()[0].msg
      })
    }

    try {

      const { did, service, verificationMethod, authentication } = request.body as { did: string, service: Service, verificationMethod: VerificationMethod, authentication: string }
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
        if (service && isValidService(service)) {
            resolvedDocument.service = resolvedDocument.service ? resolvedDocument.service.concat(service) : [service]
        }
        if (verificationMethod && isValidVerificationMethod(verificationMethod)) {
            resolvedDocument.verificationMethod?.push(verificationMethod)
        }
        if (authentication) {
            resolvedDocument.authentication = resolvedDocument.authentication ? resolvedDocument.authentication.concat(authentication) : [authentication]
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

}
