import express, { Request } from 'express'
import Helmet from 'helmet'
import cors from 'cors'
import session from 'express-session'
import cookieParser from 'cookie-parser'
import path from 'path'
import swaggerUi from 'swagger-ui-express'
import { StatusCodes } from 'http-status-codes'

import { CredentialController } from './controllers/credentials.js'
import { IssuerController } from './controllers/issuer.js'
import { AccountController } from './controllers/customer.js'
import { Authentication } from './middleware/authentication.js'
import { Connection } from './database/connection/connection.js'
import { RevocationController } from './controllers/revocation.js'
import { CORS_ERROR_MSG, configLogToExpress } from './types/constants.js'
import { LogToWebHook } from './middleware/hook.js'
import { Middleware } from './middleware/middleware.js'

import * as dotenv from 'dotenv'
dotenv.config()

// Define Swagger file
import swaggerDocument from './static/swagger.json' assert { type: "json" }
import { handleAuthRoutes, withLogto } from '@logto/express'

let swaggerOptions = {}
if (process.env.ENABLE_AUTHENTICATION === 'true') {
  swaggerOptions = {
    customJs: '/static/custom-button.js',
  }
}

class App {
  public express: express.Application

  constructor() {
    this.express = express()
    this.middleware()
    this.routes()
    Connection.instance.connect()
  }

  private middleware() {
    const auth = new Authentication()
    this.express.use(express.json({ limit: '50mb', verify: (req: Request, res, buf) => {
      req.rawBody = buf
    }}))
    this.express.use(express.raw({ type: 'application/octet-stream' }))
	  this.express.use(express.urlencoded({ extended: true }))
    this.express.use(Middleware.parseUrlEncodedJson)
    this.express.use(Helmet())
    this.express.use(cors({
        origin: function(origin, callback){

        if(!origin) return callback(null, true)
            if(process.env.CORS_ALLOWED_ORIGINS?.indexOf(origin) === -1){
            return callback(new Error(CORS_ERROR_MSG), false)
            }
            return callback(null, true)
        }
    }))

    this.express.use(cookieParser())
    if (process.env.ENABLE_AUTHENTICATION === 'true') {
      this.express.use(session({secret: process.env.COOKIE_SECRET, cookie: { maxAge: 14 * 24 * 60 * 60 }}))
      // Authentication functions/methods
      this.express.use(async (req, res, next) => await auth.setup(next))
      this.express.use(handleAuthRoutes(configLogToExpress))
      this.express.use(withLogto(configLogToExpress))
      if (process.env.ENABLE_EXTERNAL_DB === 'true') {
        this.express.use(async (req, res, next) => await auth.guard(req, res, next))
      }
    }
    this.express.use(express.text())

    this.express.use(
      '/swagger',
      swaggerUi.serve,
      swaggerUi.setup(swaggerDocument, swaggerOptions)
    )
    this.express.use(auth.handleError)
    this.express.use(async (req, res, next) => await auth.accessControl(req, res, next))
  }

  private routes() {
    const app = this.express
    
    // Top-level routes
    app.get('/', (req, res) => res.redirect('swagger'))

    // Credential API
    app.post(`/credential/issue`, CredentialController.issueValidator, new CredentialController().issue)
    app.post(`/credential/verify`, CredentialController.credentialValidator, new CredentialController().verify)
    app.post(`/credential/revoke`, CredentialController.credentialValidator, new CredentialController().revoke)
    app.post('/credential/suspend', new CredentialController().suspend)
    app.post('/credential/reinstate', new CredentialController().reinstate)

    // presentation
    app.post(`/presentation/verify`, CredentialController.presentationValidator, new CredentialController().verifyPresentation)

    // revocation
    app.post('/credential-status/create', RevocationController.commonValidator, RevocationController.statusListValidator, new RevocationController().createStatusList)
    app.post('/credential-status/update', RevocationController.updateValidator, new RevocationController().updateStatusList)
    app.post('/credential-status/publish', RevocationController.commonValidator, new RevocationController().createStatusList)
    app.post('/credential-status/check', RevocationController.commonValidator, RevocationController.checkValidator, new RevocationController().checkStatusList)
    app.get('/credential-status/search', RevocationController.commonValidator, new RevocationController().fetchStatusList)

    // Keys API
    app.post(`/key/create`, new IssuerController().createKey)
    app.get(`/key/read/:kid`, new IssuerController().getKey)

    // DIDs API 
    app.post(`/did/create`, IssuerController.createValidator, new IssuerController().createDid)
    app.post(`/did/update`, IssuerController.updateValidator, new IssuerController().updateDid)
    app.post(`/did/deactivate/:did`, IssuerController.deactivateValidator, new IssuerController().deactivateDid)
    app.get(`/did/list`, new IssuerController().getDids)
    app.get(`/did/:did`, new IssuerController().getDid)

    // Resource API
    app.post(`/resource/create/:did`, IssuerController.resourceValidator, new IssuerController().createResource)

    // Account API
    app.post(`/account`, new AccountController().create)
    app.get(`/account`, new AccountController().get)
    
    // LogTo webhooks
    app.post(`/account/bootstrap`, LogToWebHook.verifyHookSignature, new AccountController().bootstrap)

    // LogTo user info
    app.get('/auth/user-info', (req, res) => {
      res.json(req.user);
    });

    // static files
    app.get('/static/custom-button.js', 
        express.static(
          path.join(process.cwd(), '/dist'), 
          {extensions: ['js'], index: false}))

    // 404 for all other requests
    app.all('*', (req, res) => res.status(StatusCodes.BAD_REQUEST).send('Bad request'))
  }
  
}

export default new App().express