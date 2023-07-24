import { Request, Response, NextFunction } from 'express'

import { CustomerService } from '../services/customer.js'

import * as dotenv from 'dotenv'
import { withLogto, handleAuthRoutes, LogtoExpressConfig } from '@logto/express'
import { configLogToExpress } from '../types/constants.js'
import { AccountAuthHandler } from './auth/account-auth.js'
import { CredentialAuthHandler } from './auth/credential-auth.js'
import { DidAuthHandler } from './auth/did-auth.js'
import { KeyAuthHandler } from './auth/key-auth.js'
import { CredentialStatusAuthHandler } from './auth/credential-status-auth.js'
import { AbstractAuthHandler } from './auth/base-auth.js'
import { LogToHelper } from './auth/logto.js'

dotenv.config()

const {
  ENABLE_EXTERNAL_DB
} = process.env

export class Authentication {
    private authHandler: AbstractAuthHandler
    private isSetup = false
    private logToHelper: LogToHelper

    constructor() {
        // Initial auth handler
        this.authHandler = new AccountAuthHandler()
        this.logToHelper = new LogToHelper()
    }

    public async setup(request: Request, response: Response, next: NextFunction) {
        if (!this.isSetup) {
            await this.logToHelper.setup()

            const didAuthHandler = new DidAuthHandler()
            const keyAuthHandler = new KeyAuthHandler()
            const credentialAuthHandler = new CredentialAuthHandler()
            const credentialStatusAuthHandler = new CredentialStatusAuthHandler()

            // Set chain of responsibility
            this.authHandler.setNext(didAuthHandler)
            .setNext(keyAuthHandler)
            .setNext(credentialAuthHandler)
            .setNext(credentialStatusAuthHandler)

            // Set logToHelper. We do it for avoiding re-asking LogToHelper.setup() in each auth handler
            // cause it does a lot of requests to LogTo
            this.authHandler.setLogToHelper(this.logToHelper)
            didAuthHandler.setLogToHelper(this.logToHelper)
            keyAuthHandler.setLogToHelper(this.logToHelper)
            credentialAuthHandler.setLogToHelper(this.logToHelper)
            credentialStatusAuthHandler.setLogToHelper(this.logToHelper)

            this.isSetup = true
        }
        next()
    }

    public async wrapperHandleAuthRoutes(request: Request, response: Response, next: NextFunction) {
        return handleAuthRoutes(
            {...configLogToExpress, 
            scopes: this.authHandler.getAllLogToScopes() as string[],
            resources: this.authHandler.getAllLogToResources() as string[]})(request, response, next)
    }

    public async handleError(error: Error, request: Request, response: Response, next: NextFunction) {
        if (error) {
          return response.status(401).send({
            error: `${error.message}`
          })
        }
        next()
    }

    public async accessControl(request: Request, response: Response, next: NextFunction) {
        let message = undefined

        if (this.authHandler.skipPath(request.path)) 
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

    public async guard(jwtRequest: Request, response: Response, next: NextFunction) {
		const { provider } = jwtRequest.body as { claim: string, provider: string }
        // const namespace = apiGuarding.getNamespaceFromRequest(jwtRequest)
        if (this.authHandler.skipPath(jwtRequest.path)) 
            return next()

		try {
                // If response got back that means error was raised
                const _resp = await this.authHandler.handle(jwtRequest, response)
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
    
    public async withLogtoWrapper(request: Request, response: Response, next: NextFunction) {
        if (this.authHandler.skipPath(request.path)) 
            return next()
        try {
            let config: LogtoExpressConfig = configLogToExpress
            if (! this.authHandler.skipPath(request.path)) {
                const resourceAPI = AbstractAuthHandler.buildResourceAPIUrl(request)
                if (!resourceAPI) {
                    return next()
                }
                config = {...configLogToExpress, resource: resourceAPI, scopes: this.authHandler.getAllLogToScopes() as string[]}
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