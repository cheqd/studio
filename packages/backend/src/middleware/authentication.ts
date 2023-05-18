import { Request, Response, NextFunction } from 'express'
import { expressjwt, Request as JWTRequest } from 'express-jwt'

import { CustomerService } from '../services/customer.js'
import { HEADERS } from '../types/constants.js'
import { GenericAuthResponse } from '../types/types.js'

import * as dotenv from 'dotenv'
dotenv.config()

const { ISSUER_SECRET_KEY, AUTH0_SERVICE_ENDPOINT } = process.env

export class Authentication {
    static expressJWT = expressjwt({
        secret: ISSUER_SECRET_KEY,
        algorithms: ["HS256"],
        credentialsRequired: true
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

        if(jwtRequest.path != '/1.0/api/account' && !await CustomerService.instance.find(jwtRequest.auth.sub, {})) return response.status(401).json({
            error: 'Customer not found'
        })

        response.locals.customerId = jwtRequest.auth.sub
        next()
    }

    static async guard(request: Request, response: Response, next: NextFunction) {
		const { claim, provider } = request.body as { claim: string, provider: string }

		try {
			// const resp = await fetch(
			// 	AUTH0_SERVICE_ENDPOINT,
			// 	{
			// 		method: 'POST',
			// 		body: JSON.stringify({ claim, provider: provider.toLowerCase() }),
			// 		headers: HEADERS.json
			// 	}
			// )
			// const validation: GenericAuthResponse = await resp.json()
            // if (!validation.authenticated) {
            //     return response.status(401).json({
            //         authenticated: false,
            //         error: 'Invalid Auth token'
            //     })
            // }
			// response.locals.authResponse = { ...validation, provider }
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