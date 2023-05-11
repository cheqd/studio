import express from 'express'
import Helmet from 'helmet'
import { CredentialController } from './controllers/credentials'
import { StoreController } from './controllers/store'
import cors from 'cors'
import { CORS_ERROR_MSG } from './types/constants'
import * as swagger from 'swagger-ui-express'
import * as swaggerJson from '../swagger.json'
import { LogtoExpressConfig, handleAuthRoutes, withLogto } from '@logto/express'
import cookieParser from 'cookie-parser';
import session from 'express-session';

require('dotenv').config()

const logToConfig: LogtoExpressConfig = {
    appId: process.env.PUBLIC_LOGTO_APP_ID,
    appSecret: process.env.PUBLIC_LOGTO_APP_SECRET,
    endpoint: process.env.PUBLIC_LOGTO_ENDPOINT, // E.g. http://localhost:3001
    baseUrl: "localhost:8787", // E.g. http://localhost:3000
};

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
    this.express.use('/api-docs', swagger.serve, swagger.setup(swaggerJson))
  }

  private routes() {
    const app = this.express
    const URL_PREFIX = '/1.0/api'

    app.use(cookieParser());
    app.use(session({ secret: 'qnolk8ttum9legx0n8oq6mfy68givbo8', cookie: { maxAge: 14 * 24 * 60 * 60 } }));

    app.use(handleAuthRoutes(logToConfig));

    app.get('/', (req, res) => {
      res.setHeader('content-type', 'text/html');
      res.end(`<div><a href="/logto/sign-in">Sign In</a></div>`);
    });

    app.post('/logto/sign-in-callback', (req, res) => {
      res.setHeader('content-type', 'text/html');
      res.end(`<label>res</label>`)
      console.log(res);
    });

    app.get(
      '/fetch-access-token',
      withLogto({
        ...logToConfig,
        // Fetch access token from remote, this may slow down the response time,
        // you can also add "resource" if needed.
        getAccessToken: true,
      }),
      (request, response) => {
        // Get access token here
        console.log(request.user.accessToken);
        response.json(request.user);
      }
    );

    // app.get('/', (req, res) => res.redirect('api-docs'))

    // credentials
    app.post(`${URL_PREFIX}/credentials/issue`, CredentialController.issueValidator, new CredentialController().issue)
    app.post(`${URL_PREFIX}/credentials/verify`, CredentialController.verifyValidator, new CredentialController().verify)

    // store
    app.post(`${URL_PREFIX}/store`, new StoreController().set)
    app.get(`${URL_PREFIX}/store/:id`, new StoreController().get)

    // 404 for all other requests
    // app.all('*', (req, res) => res.status(400).send('Bad request'))
  }
  
}

export default new App().express