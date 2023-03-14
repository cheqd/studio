import express from 'express'
import Helmet from 'helmet'


class App {
  public express: express.Application

  constructor() {
    this.express = express()
    this.middleware()
    this.routes()
    CheqdRegistrar.instance
  }

  private middleware() {
    this.express.use(express.json({ limit: '50mb' }))
		this.express.use(express.urlencoded({ extended: false }))
    this.express.use(Helmet())
    this.express.use('/api-docs', swagger.serve, swagger.setup(swaggerJson))
  }

  private routes() {
    const app = this.express
    const URL_PREFIX = '/1.0'
    
    app.get('/', (req, res) => res.json("Hello World"))

    // did-registrar
    app.post(`${URL_PREFIX}/issue`, DidController.createValidator, DidController.commonValidator, new DidController().create)
    app.post(`${URL_PREFIX}/verify`, DidController.updateValidator, DidController.commonValidator, new DidController().update)

    // 404 for all other requests
    app.all('*', (req, res) => res.status(400).send('Bad request'))
  }
  
}

export default new App().express