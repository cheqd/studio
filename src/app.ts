import express from 'express'
import Helmet from 'helmet'
import cors from 'cors'
import * as swagger from 'swagger-ui-express'

import { CredentialController } from './controllers/credentials'
import { StoreController } from './controllers/store'
import { IssuerController } from './controllers/issuer'
import { CustomerController } from './controllers/customer'
import { Authentication } from './middleware/authentication'
import { Connection } from './database/connection/connection'
import { CORS_ERROR_MSG } from './types/constants'
import * as swaggerJson from '../swagger.json'

require('dotenv').config()

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
    this.express.use('/api-docs', swagger.serve, swagger.setup(swaggerJson))
    this.express.use(Authentication.expressJWT)
    this.express.use(Authentication.authenticate)
    this.express.use(Authentication.handleError)
  }

  private routes() {
    const app = this.express
    const URL_PREFIX = '/1.0/api'

    app.get('/', (req, res) => res.redirect('api-docs'))

    // credentials
    app.post(`${URL_PREFIX}/credentials/issue`, CredentialController.issueValidator, new CredentialController().issue)
    app.post(`${URL_PREFIX}/credentials/verify`, CredentialController.verifyValidator, new CredentialController().verify)

    // store
    app.post(`${URL_PREFIX}/store`, new StoreController().set)
    app.get(`${URL_PREFIX}/store/:id`, new StoreController().get)

    // issuer
    app.post(`${URL_PREFIX}/key/create`, new IssuerController().createKey)
    app.get(`${URL_PREFIX}/key/:kid`, new IssuerController().getKey)
    app.post(`${URL_PREFIX}/did`, new IssuerController().createDid)
    app.get(`${URL_PREFIX}/did`, new IssuerController().getDids)
    app.get(`${URL_PREFIX}/did/:did`, new IssuerController().getDids)

    // customer
    app.post(`${URL_PREFIX}/customer`, new CustomerController().create)
    app.get(`${URL_PREFIX}/customer`, new CustomerController().get)

    // 404 for all other requests
    app.all('*', (req, res) => res.status(400).send('Bad requestssss'))
  }
  
}

export default new App().express