import { Request, Response, NextFunction } from 'express'

import * as dotenv from 'dotenv'
import { verifyHookSignature } from '../helpers/helpers.js'

dotenv.config()

export class LogToWebHook {
    static async verifyHookSignature(request: Request, response: Response, next: NextFunction) {
        const logtoSignature = request.headers['logto-signature-sha-256'] as string
        request.setEncoding('utf8');
        if (!verifyHookSignature(process.env.LOGTO_WEBHOOK_SECRET as string, request.body, logtoSignature)) {
            return response.status(400).json({
                error: "Invalid signature in LogTo webhook"
            })
        }
        next()
    }
}
