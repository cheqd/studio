import { Request, Response, NextFunction } from 'express'
import { expressjwt, Request as JWTRequest } from 'express-jwt'
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { CustomerService } from '../services/customer.js'
import { IncomingHttpHeaders } from 'http';

import * as dotenv from 'dotenv'
dotenv.config()

const { OIDC_JWKS_ENDPOINT, AUDIENCE_ENDPOINT, OIDC_ISSUER, ENABLE_AUTH, CUSTOMER_ID } = process.env
const bearerTokenIdentifier = 'Bearer'

export const extractBearerTokenFromHeaders = ({ authorization }: IncomingHttpHeaders) => {
    if (!authorization) {
        throw new Error('Authorization header is missing.')
    }
    if (!authorization.startsWith(bearerTokenIdentifier)) {
        throw new Error(`Authorization token type is not supported. Valid type: "${bearerTokenIdentifier}".`)
    }
  
    return authorization.slice(bearerTokenIdentifier.length + 1);
};

export class Authentication {
    static expressJWT = expressjwt({
        secret: "random-secret",
        algorithms: ["ES384"],
        credentialsRequired: false
    })

    static handleError(error: Error, jwtRequest: JWTRequest, response: Response, next: NextFunction) {
        if (error) {
          return response.status(401).send({
            error: `${error.message}`
          })
        }
        next()
    }

    static async authenticate(jwtRequest: JWTRequest, response: Response, next: NextFunction) {
        if(jwtRequest.path == '/') return next()

        if (!jwtRequest.auth?.sub) return response.status(401).json({
            error: 'Invalid auth token'
        })

        if(jwtRequest.path != '/account' && !await CustomerService.instance.find(jwtRequest.auth.sub, {})) return response.status(401).json({
            error: 'Customer not found'
        })

        response.locals.customerId = jwtRequest.auth.sub
        next()
    }

    static async guard(jwtRequest: Request, response: Response, next: NextFunction) {
		const { claim, provider } = jwtRequest.body as { claim: string, provider: string }
        if (jwtRequest.path == '/' || jwtRequest.path == '/swagger') return next()

		try {
            if (ENABLE_AUTH === 'true') {
                const token = extractBearerTokenFromHeaders(jwtRequest.headers)
    
                const { payload } = await jwtVerify(
                    token, // The raw Bearer Token extracted from the request header
                    createRemoteJWKSet(new URL(OIDC_JWKS_ENDPOINT)), // generate a jwks using jwks_uri inquired from Logto server
                    {
                        // expected issuer of the token, should be issued by the Logto server
                        issuer: OIDC_ISSUER,
                        // expected audience token, should be the resource indicator of the current API
                        audience: AUDIENCE_ENDPOINT,
                    }
                );
            
                // custom payload logic
                response.locals.customerId = payload.sub
            } else if (CUSTOMER_ID) {
                response.locals.customerId = CUSTOMER_ID
            } else {
                return response.status(400).json({
                    error: `Unauthorized error`
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