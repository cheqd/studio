import express from 'express'
import Helmet from 'helmet'
import { CredentialController } from './controllers/credentials'
import { StoreController } from './controllers/store'
import cors from 'cors'
import { CORS_ERROR_MSG } from './types/constants'

require('dotenv').config()

class App {
  public express: express.Application

  constructor() {
    this.express = express()
    this.middleware()
    this.routes()
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
  }

  private routes() {
    const app = this.express
    const URL_CREDENTIAL_PREFIX = '/api/credentials'
    const URL_STORE_PREFIX = '/store'

    app.get('/', (req, res) => res.json({ ping: 'pong' }))

    // credentials
    app.post(`${URL_CREDENTIAL_PREFIX}/issue`, CredentialController.issueValidator, new CredentialController().issue)
    app.post(`${URL_CREDENTIAL_PREFIX}/verify`, CredentialController.verifyValidator, new CredentialController().verify)

    // store
    app.post(`${URL_STORE_PREFIX}/`, new StoreController().set)
    app.get(`${URL_CREDENTIAL_PREFIX}/:id`, new StoreController().get)

    // 404 for all other requests
    app.all('*', (req, res) => res.status(400).send('Bad request'))
  }
  
}

export default new App().express