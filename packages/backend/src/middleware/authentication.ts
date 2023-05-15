import { Response, NextFunction } from 'express'
import { expressjwt, Request as JWTRequest } from 'express-jwt'
import { CustomerService } from '../services/customer'

require('dotenv').config()

const { ISSUER_SECRET_KEY } = process.env

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
}