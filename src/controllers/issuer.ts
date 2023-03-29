import { Request, Response } from 'express'
import { Identity } from '../services/identity'

export class IssuerController {
  
  public async createKey(request: Request, response: Response) {
    try {
      const key = await Identity.instance.createKey()
      return response.status(200).json(key)
    } catch (error) {
        return response.status(500).json({
            error: `Internal error: ${error}`
        })
    }
  }

  public async getKey(request: Request, response: Response) {
    try {
      const key = await Identity.instance.getKey(request.params.kid)
      return response.status(200).json(key)
    } catch (error) {
        return response.status(500).json({
            error: `Internal error: ${error}`
        })
    }
  }

  public async createDid(request: Request, response: Response) {
    const { network, kids, didDocument, alias } = request.body
    try {
      const did = await Identity.instance.createDid(network, didDocument, alias)
      return response.status(200).json(did)
    } catch (error) {
        return response.status(500).json({
            error: `Error: ${error}`
        })
    }
  }

  public async getDids(request: Request, response: Response) {
    try {
      let did: any
      if(request.params.did) {
        did = await Identity.instance.resolveDid(request.params.did)
      } else {
        did = await Identity.instance.listDids()
      }

      return response.status(200).json(did)
    } catch (error) {
        return response.status(500).json({
            error: `Error: ${error}`
        })
    }
  }

}
