import { Request, Response, NextFunction } from 'express'

import { CustomerService } from '../services/customer.js'

import * as dotenv from 'dotenv'
import { withLogto } from '@logto/express'
import { configLogToExpress } from '../types/constants.js'
import { AccountAuthHandler } from './auth/account_auth.js'
import { CredentialAuthHandler } from './auth/credential_auth.js'
import { DidAuthHandler } from './auth/did_auth.js'
import { KeyAuthHandler } from './auth/key_auth.js'

dotenv.config()

const {
  LOGTO_DEFAULT_RESOURCE_URL,
  ENABLE_AUTHENTICATION,
  DEFAULT_CUSTOMER_ID,
  ENABLE_EXTERNAL_DB
} = process.env

const authHandler = new AccountAuthHandler()
authHandler.setNext(new CredentialAuthHandler()).
setNext(new DidAuthHandler()).
setNext(new KeyAuthHandler())

export class Authentication {

    private static buildResourceAPIUrl(request: Request) {
        const api_root = request.path.split('/')[1]
        if (!api_root) {
            // Skip if no api root
            return null
        }
        return `${LOGTO_DEFAULT_RESOURCE_URL}/${api_root}`
    }

    static handleError(error: Error, request: Request, response: Response, next: NextFunction) {
        if (error) {
          return response.status(401).send({
            error: `${error.message}`
          })
        }
        next()
    }

    static async accessControl(request: Request, response: Response, next: NextFunction) {
        let message = undefined

        if (authHandler.skipPath(request.path)) 
            return next()

        switch(ENABLE_EXTERNAL_DB) {
            case 'false':
                if (['/account', '/did/create', '/key/create'].includes(request.path)) {
                  message = 'Api not supported'
                }
                break
            default:
                if (!['/account', '/', '/store'].includes(request.path) && !await CustomerService.instance.find(response.locals.customerId, {})) {
                    message = 'Customer not found'
                }
                break
        }

        if(message) {
            return response.status(400).json({
                error: message
            })
        }
        next()
    }

    static async guard(jwtRequest: Request, response: Response, next: NextFunction) {
		const { provider } = jwtRequest.body as { claim: string, provider: string }
        // const namespace = apiGuarding.getNamespaceFromRequest(jwtRequest)
        if (authHandler.skipPath(jwtRequest.path)) 
            return next()

		try {
            if (ENABLE_AUTHENTICATION === 'true') {
                // If response got back that means error was raised
                const _resp = await authHandler.handle(jwtRequest, response)
                if (_resp && _resp.status !== 200) {
                    return response.status(_resp.status).json({
                        error: _resp.error})
                }
                response.locals.customerId = _resp.data.customerId
            } else if (DEFAULT_CUSTOMER_ID) {
                response.locals.customerId = DEFAULT_CUSTOMER_ID
            } else {
                return response.status(400).json({
                    error: `Unauthorized error. It requires ENABLE_AUTHENTICATION=true and bearerToken in headers or DEFAULT_CUSTOMER_ID to be set.`
                })
            }
            next()
		} catch (err) {
			return response.status(500).send({
                authenticated: false,
                error: `${err}`,
                customerId: null,
                provider
            })
		}
	}
    
    static async withLogtoWrapper(request: Request, response: Response, next: NextFunction) {
        if (authHandler.skipPath(request.path)) 
            return next()
        try {
            if (ENABLE_AUTHENTICATION === 'true') {
                // compile API resource
                const resourceAPI = Authentication.buildResourceAPIUrl(request)
                if (!resourceAPI) {
                    return next()
                }
                return withLogto({...configLogToExpress, resource: resourceAPI})(request, response, next)
                
            }
            else {
                next()
            }
		} catch (err) {
			return response.status(500).send({
                authenticated: false,
                error: `${err}`,
                customerId: null,
            })
		}
    }
}