import { Request, Response, NextFunction } from 'express'
import { Request as JWTRequest } from 'express-jwt'
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { CustomerService } from '../services/customer.js'
import { IncomingHttpHeaders } from 'http'

import * as dotenv from 'dotenv'
import {apiGuarding} from "../types/types.js";
dotenv.config()

const {
  LOGTO_ENDPOINT,
  LOGTO_RESOURCE_URL,
  ENABLE_AUTHENTICATION,
  DEFAULT_CUSTOMER_ID,
  ENABLE_EXTERNAL_DB
} = process.env

const OIDC_ISSUER = LOGTO_ENDPOINT + '/oidc'
const OIDC_JWKS_ENDPOINT = LOGTO_ENDPOINT + '/oidc/jwks'
const bearerTokenIdentifier = 'Bearer'

export const extractBearerTokenFromHeaders = ({ authorization }: IncomingHttpHeaders) => {
    if (!authorization) {
        throw new Error('Authorization header is missing.')
    }
    if (!authorization.startsWith(bearerTokenIdentifier)) {
        throw new Error(`Authorization token type is not supported. Valid type: "${bearerTokenIdentifier}".`)
    }
  
    return authorization.slice(bearerTokenIdentifier.length + 1)
}

export class Authentication {

    static handleError(error: Error, jwtRequest: JWTRequest, response: Response, next: NextFunction) {
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
        if (apiGuarding.skipPath(jwtRequest.path)) 
            return next()

		try {
            if (ENABLE_AUTHENTICATION === 'true') {
                const token = extractBearerTokenFromHeaders(jwtRequest.headers)
    
                const { payload } = await jwtVerify(
                    token, // The raw Bearer Token extracted from the request header
                    createRemoteJWKSet(new URL(OIDC_JWKS_ENDPOINT)), // generate a jwks using jwks_uri inquired from Logto server
                    {
                        // expected issuer of the token, should be issued by the Logto server
                        issuer: OIDC_ISSUER,
                        // expected audience token, should be the resource indicator of the current API
                        audience: LOGTO_RESOURCE_URL,
                    }
                );

                let scopes: string[] = [];
                if (payload.scope) {
                    scopes = (payload.scope as string).split(' ');
                } else {
                    return response.status(400).json({
                        error: `Unauthorized error: It's required to provide a token with scopes inside.`
                    })
                }

                if (!apiGuarding.areValidScopes(jwtRequest.path, jwtRequest.method, scopes)) {
                    return response.status(400).json({
                        error: `Unauthorized error: Provided token does not have the required scopes. You need ${apiGuarding.getScopeForRoute(jwtRequest.path, jwtRequest.method)} scope(s).`
                    })
                }
            
                // custom payload logic
                response.locals.customerId = payload.sub
            } else if (DEFAULT_CUSTOMER_ID) {
                response.locals.customerId = DEFAULT_CUSTOMER_ID
            } else {
                return response.status(400).json({
                    error: `Unauthorized error. It requires ENABLE_AUTH=true and bearerToken in headers or CUSTOMER_ID to be set.`
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
}