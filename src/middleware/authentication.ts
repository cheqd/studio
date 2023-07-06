import { Request, Response, NextFunction } from 'express'

import { CustomerService } from '../services/customer.js'

import * as dotenv from 'dotenv'
import { withLogto, handleAuthRoutes, LogtoExpressConfig } from '@logto/express'
import { configLogToExpress } from '../types/constants.js'
import { AccountAuthHandler } from './auth/account_auth.js'
import { CredentialAuthHandler } from './auth/credential_auth.js'
import { DidAuthHandler } from './auth/did_auth.js'
import { KeyAuthHandler } from './auth/key_auth.js'
import { CredentialStatusAuthHandler } from './auth/credential-status.js'
import { AbstractAuthHandler } from './auth/base_auth.js'
import { LogToHelper } from './auth/logto.js'

dotenv.config()

const {
  ENABLE_AUTHENTICATION,
  DEFAULT_CUSTOMER_ID,
  ENABLE_EXTERNAL_DB
} = process.env

const authHandler = new AccountAuthHandler()
const didAuthHandler = new DidAuthHandler()
const keyAuthHandler = new KeyAuthHandler()
const credentialAuthHandler = new CredentialAuthHandler()
const credentialStatusAuthHandler = new CredentialStatusAuthHandler()

if (process.env.ENABLE_AUTHENTICATION === 'true') {
    authHandler.setNext(new CredentialAuthHandler()).
    setNext(didAuthHandler).
    setNext(keyAuthHandler).
    setNext(credentialAuthHandler).
    setNext(credentialStatusAuthHandler)

}

export class Authentication {

    static async wrapperHandleAuthRoutes(request: Request, response: Response, next: NextFunction) {
        await authHandler.setup()
        await didAuthHandler.setup()
        await keyAuthHandler.setup()
        await credentialAuthHandler.setup()
        await credentialStatusAuthHandler.setup()
        return handleAuthRoutes(
            {...configLogToExpress, 
            scopes: authHandler.getAllLogToScopes() as string[],
            resources: authHandler.getAllLogToResources() as string[]})(request, response, next)
    }

    static async handleError(error: Error, request: Request, response: Response, next: NextFunction) {
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
                // If response got back that means error was raised
                const _resp = await authHandler.handle(jwtRequest, response)
                if (_resp && _resp.status !== 200) {
                    return response.status(_resp.status).json({
                        error: _resp.error})
                }
                response.locals.customerId = _resp.data.customerId
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
            let config: LogtoExpressConfig = configLogToExpress
            if (! authHandler.skipPath(request.path)) {
                const resourceAPI = AbstractAuthHandler.buildResourceAPIUrl(request)
                if (!resourceAPI) {
                    return next()
                }
                config = {...configLogToExpress, resource: resourceAPI, scopes: authHandler.getAllLogToScopes() as string[]}
            }
            return withLogto(config)(request, response, next)
		} catch (err) {
			return response.status(500).send({
                authenticated: false,
                error: `${err}`,
                customerId: null,
            })
		}
    }
}