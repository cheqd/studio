import { Request, Response, NextFunction } from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'

import { CustomerService } from '../services/customer.js'

import * as dotenv from 'dotenv'
import { apiGuarding } from "../types/types.js"
import { withLogto } from '@logto/express'
import { configLogToExpress } from '../types/constants.js'
import { request } from 'http'
dotenv.config()

const {
  LOGTO_ENDPOINT,
  LOGTO_DEFAULT_RESOURCE_URL,
  ENABLE_AUTHENTICATION,
  DEFAULT_CUSTOMER_ID,
  ENABLE_EXTERNAL_DB
} = process.env

const OIDC_ISSUER = LOGTO_ENDPOINT + '/oidc'
const OIDC_JWKS_ENDPOINT = LOGTO_ENDPOINT + '/oidc/jwks'

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

        if (apiGuarding.skipPath(request.path)) 
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
        const namespace = apiGuarding.getNamespaceFromRequest(jwtRequest)
        if (apiGuarding.skipPath(jwtRequest.path)) 
            return next()

		try {
            if (ENABLE_AUTHENTICATION === 'true') {
                const token = Object.getOwnPropertyNames(jwtRequest.user).length > 0 ? jwtRequest.user.accessToken : null;
                if (!token) {
                    return response.status(400).json({
                        error: `Unauthorized error: Looks like you are not logged in using LogTo properly.`
                    })
                }

                const resourceAPI = Authentication.buildResourceAPIUrl(jwtRequest)
                if (!resourceAPI) {
                    return response.status(400).json({
                        error: `Unauthorized error: Looks like you are not logged in using LogTo properly.`
                    })
                }
    
                const { payload } = await jwtVerify(
                    token, // The raw Bearer Token extracted from the request header
                    createRemoteJWKSet(new URL(OIDC_JWKS_ENDPOINT)), // generate a jwks using jwks_uri inquired from Logto server
                    {
                        // expected issuer of the token, should be issued by the Logto server
                        issuer: OIDC_ISSUER,
                        // expected audience token, should be the resource indicator of the current API
                        audience: resourceAPI,
                    }
                )

                const scopes = jwtRequest.user.scopes;
                if (!scopes) {
                    return response.status(400).json({
                        error: `Unauthorized error: Seems your LogTo account does not have any scopes. 
                        Ask your administrator to assign scopes to your account.`
                    })
                }

                if (!apiGuarding.areValidScopes(jwtRequest.path, jwtRequest.method, scopes, namespace)) {
                    return response.status(400).json({
                        error: `Unauthorized error: Current LogTo account does not have the required scopes. 
                        You need ${apiGuarding.getScopeForRoute(jwtRequest.path, jwtRequest.method, namespace)} scope(s).`
                    })
                }
            
                // custom payload logic
                response.locals.customerId = payload.sub
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
        if (apiGuarding.skipPath(request.path)) 
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