import express from 'express'
import Helmet from 'helmet'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import session from 'express-session'
import cookieParser from 'cookie-parser'

import { CredentialController } from './controllers/credentials.js'
import { StoreController } from './controllers/store.js'
import { IssuerController } from './controllers/issuer.js'
import { CustomerController } from './controllers/customer.js'
import { Authentication } from './middleware/authentication.js'
import { Connection } from './database/connection/connection.js'
import { RevocationController } from './controllers/revocation.js'

import swaggerJSONDoc from './static/swagger.json' assert { type: "json" }

import * as dotenv from 'dotenv'
dotenv.config()

import { UserInfo } from './controllers/user_info.js'
import path from 'path'
import e from 'express'
import { Middleware } from './middleware/middleware.js'

class App {
  public express: express.Application

  constructor() {
    this.express = express()
    this.middleware()
    this.routes()
    Connection.instance.connect()
  }

  private middleware() {
    this.express.use(express.json({ limit: '50mb' }))
    this.express.use(express.urlencoded({ extended: true }))
    this.express.use(Middleware.parseUrlEncodedJson)
    this.express.use(Helmet(
      {
        contentSecurityPolicy: {
          directives: {
            "script-src": ["'self'"],
            "connect-src": ["'self'", "localhost:3001"],
            "style-src": ["self", "'unsafe-inline'", "localhost:8787"],
            "img-src": ["'self'", "data:"],
            "default-src": ["'self'"],
            "font-src": ["'self'"],
            "object-src": ["'none'"],
          },
        },
      }
    ))
    this.express.use(cors({
        origin: process.env.ALLOWED_ORIGINS,
    }))

    this.express.use(cookieParser())
    if (process.env.ENABLE_AUTHENTICATION === 'true') {
      this.express.use(session({secret: process.env.COOKIE_SECRET, cookie: { maxAge: 14 * 24 * 60 * 60 }}))
      // Authentication funcitons/methods
      this.express.use(Authentication.wrapperHandleAuthRoutes)
      this.express.use(Authentication.withLogtoWrapper)
    }
    if (process.env.ENABLE_EXTERNAL_DB === 'true') {
        this.express.use(Authentication.guard)
    }
    this.express.use(express.text())
    this.express.use(Authentication.handleError)
    this.express.use(Authentication.accessControl)
  }

  private routes() {
    const app = this.express
    app.get('/', (req, res) => res.redirect('swagger'))

    app.get('/user', new UserInfo().getUserInfo)

    // credentials
    app.post(`/credential/issue`, CredentialController.issueValidator, new CredentialController().issue)
    app.post(`/credential/verify`, CredentialController.credentialValidator, new CredentialController().verify)
    app.post(`/credential/revoke`, CredentialController.credentialValidator, new CredentialController().revoke)
    app.post('/credential/suspend', new CredentialController().suspend)
    app.post('/credential/reinstate', new CredentialController().reinstate)

    // presentation
    app.post(`/presentation/verify`, CredentialController.presentationValidator, new CredentialController().verifyPresentation)

    //revocation
    app.post('/credential-status/create', RevocationController.queryValidator, RevocationController.statusListValidator, new RevocationController().createStatusList)
    app.post('/credential-status/update', RevocationController.updateValidator, new RevocationController().updateStatusList)
    app.post('/credential-status/publish', RevocationController.queryValidator, new RevocationController().createStatusList)
    app.get('/credential-status/search', RevocationController.queryValidator, new RevocationController().fetchStatusList)

    // store
    app.post(`/store`, new StoreController().set)
    app.get(`/store/:id`, new StoreController().get)

    // issuer
    app.post(`/key/create`, new IssuerController().createKey)
    app.get(`/key/:kid`, new IssuerController().getKey)
    app.post(`/did/create`, IssuerController.createValidator, new IssuerController().createDid)
    app.post(`/did/update`, IssuerController.updateValidator, new IssuerController().updateDid)
    app.post(`/did/deactivate/:did`, IssuerController.deactivateValidator, new IssuerController().deactivateDid)
    app.get(`/did/list`, new IssuerController().getDids)
    app.get(`/did/:did`, new IssuerController().getDids)
    app.post(`/resource/create/:did`, IssuerController.resourceValidator, new IssuerController().createResource)

    // customer
    app.post(`/account`, new CustomerController().create)
    app.get(`/account`, new CustomerController().get)

    const oauthOptions = {
      oauth: {
        clientId: process.env.LOGTO_APP_ID,
        clientSecret: process.env.LOGTO_APP_SECRET,
        appName: 'Credential',
        scopeSeparator: ' ',
        additionalQueryStringParams: { prompt: 'consent' },
        scopes: ['issue:credential:testnet'],
      }
    };
    app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerJSONDoc, {}, oauthOptions))

    // static files
    app.get('/static/custom-button.js', 
        express.static(
          path.join(process.cwd(), '/dist'), 
          {extensions: ['js'], index: false}))

    // 404 for all other requests
    app.all('*', (req, res) => res.status(400).send('Bad request'))
  }
  
}

export default new App().express