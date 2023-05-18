import express from 'express'
import Helmet from 'helmet'
import cors from 'cors'
import * as swagger from 'swagger-ui-express'

import { CredentialController } from './controllers/credentials.js'
import { StoreController } from './controllers/store.js'
import { IssuerController } from './controllers/issuer.js'
import { CustomerController } from './controllers/customer.js'
import { Authentication } from './middleware/authentication.js'
import { Connection } from './database/connection/connection.js'
import { CORS_ERROR_MSG } from './types/constants.js'
import * as swaggerJson from '../swagger.json' assert { type: 'json' }

import * as dotenv from 'dotenv'
dotenv.config()

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
            if(process.env.ALLOWED_ORIGINS?.indexOf(origin) === -1){
            return callback(new Error(CORS_ERROR_MSG), false)
            }
            return callback(null, true)
        }
    }))
    this.express.use('/swagger', swagger.serve, swagger.setup(swaggerJson))
    this.express.use(Authentication.expressJWT.unless({
        path: '/'
    }))
    this.express.use(Authentication.authenticate)
    this.express.use(Authentication.handleError)
  }

  private routes() {
    const app = this.express
    const URL_PREFIX = '/1.0/api'

    app.get('/', (req, res) => res.redirect('swagger'))

    // credentials
    app.post(`${URL_PREFIX}/credentials/issue`, CredentialController.issueValidator, new CredentialController().issue)
    app.post(`${URL_PREFIX}/credentials/verify`, CredentialController.verifyValidator, new CredentialController().verify)

    // store
    app.post(`${URL_PREFIX}/store`, new StoreController().set)
    app.get(`${URL_PREFIX}/store/:id`, new StoreController().get)

    // issuer
    app.post(`${URL_PREFIX}/keys/create`, new IssuerController().createKey)
    app.get(`${URL_PREFIX}/keys/:kid`, new IssuerController().getKey)
    app.post(`${URL_PREFIX}/dids/create`, new IssuerController().createDid)
    app.get(`${URL_PREFIX}/dids`, new IssuerController().getDids)
    app.get(`${URL_PREFIX}/dids/:did`, new IssuerController().getDids)

    // customer
    app.post(`${URL_PREFIX}/account`, new CustomerController().create)
    app.get(`${URL_PREFIX}/account`, new CustomerController().get)

    // 404 for all other requests
    app.all('*', (req, res) => res.status(400).send('Bad request'))
  }
  
}

export default new App().express