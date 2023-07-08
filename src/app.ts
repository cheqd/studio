import express from 'express'
import Helmet from 'helmet'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import session from 'express-session'
import cookieParser from 'cookie-parser'
import {withLogto, handleAuthRoutes } from '@logto/express'

import { CredentialController } from './controllers/credentials.js'
import { StoreController } from './controllers/store.js'
import { IssuerController } from './controllers/issuer.js'
import { CustomerController } from './controllers/customer.js'
import { Authentication } from './middleware/authentication.js'
import { Connection } from './database/connection/connection.js'
import { RevocationController } from './controllers/revocation.js'
import { CORS_ERROR_MSG, configLogToExpress } from './types/constants.js'

import * as dotenv from 'dotenv'
dotenv.config()

import { UserInfo } from './controllers/user_info.js'
import path from 'path'

import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Hello World',
      version: '1.0.0',
    },
    components: {}
  },
  apis: ['./src/controllers/*.ts'], // files containing annotations as above
  security: [
    {
        bearerAuth: []
    }
  ]
};

const openApiSpecification = swaggerJsdoc(options);

let swagger_options = {}
if (process.env.ENABLE_AUTHENTICATION === 'true') {
  swagger_options = {
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
    this.express.use(express.json({ limit: '50mb' }))
	this.express.use(express.urlencoded({ extended: false }))
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
      // Authentication funcitons/methods
      this.express.use(Authentication.wrapperHandleAuthRoutes)
      this.express.use(Authentication.withLogtoWrapper)
      this.express.use(Authentication.guard)
    }
    this.express.use(express.text())

    this.express.use(
      '/swagger',
      swaggerUi.serve,
      swaggerUi.setup(openApiSpecification, swagger_options)
    )
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

    //credential-status
    app.post('/credential-status/statusList2021/create', RevocationController.didValidator, RevocationController.statusListValidator, new RevocationController().createStatusList)
    app.get('/credential-status/statusList2021/list', RevocationController.didValidator, new RevocationController().fetchStatusList)
    // store
    app.post(`/store`, new StoreController().set)
    app.get(`/store/:id`, new StoreController().get)

    // issuer
    app.post(`/key/create`, new IssuerController().createKey)
    app.get(`/key/:kid`, new IssuerController().getKey)
    app.post(`/did/create`, IssuerController.didValidator, new IssuerController().createDid)
    app.get(`/did/list`, new IssuerController().getDids)
    app.get(`/did/:did`, new IssuerController().getDids)
    app.post(`/:did/create-resource`, IssuerController.resourceValidator, new IssuerController().createResource)

    // customer
    app.post(`/account`, new CustomerController().create)
    app.get(`/account`, new CustomerController().get)

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