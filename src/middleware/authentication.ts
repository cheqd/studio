import { Response, NextFunction } from 'express'
import { expressjwt, Request as JWTRequest } from 'express-jwt'

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

    static authenticate(jwtRequest: JWTRequest, response: Response, next: NextFunction) {
        if (!jwtRequest.auth?.sub) return response.status(401).json({
            error: 'Invalid auth token'
        })
        response.locals.customerId = jwtRequest.auth.sub
        next()
    }
}