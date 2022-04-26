import 'cross-fetch/polyfill'
import {
  IAgent,
  createAgent,
  IAgentOptions,
  IMessageHandler,
} from '@veramo/core'
import { Connection } from 'typeorm'
import { AgentRestClient } from '@veramo/remote-client'
import express from 'express'
import { Server } from 'http'
import { AgentRouter, RequestWithAgentRouter } from '@veramo/remote-server'
import { getConfig } from '@veramo/cli/build/setup'
import { createObjects } from '@veramo/cli/build/lib/objectCreator'
import { IMyAgentPlugin } from '../src/types/IMyAgentPlugin'
import fs from 'fs'

jest.setTimeout(30000)

// Shared tests
import myPluginLogic from './shared/myPluginLogic'

const databaseFile = 'rest-database.sqlite'
const port = 3002
const basePath = '/agent'

let serverAgent: IAgent
let restServer: Server
let dbConnection: Promise<Connection>

const getAgent = (options?: IAgentOptions) =>
  createAgent<IMyAgentPlugin & IMessageHandler>({
    ...options,
    plugins: [
      new AgentRestClient({
        url: 'http://localhost:' + port + basePath,
        enabledMethods: serverAgent.availableMethods(),
        schema: serverAgent.getSchema(),
      }),
    ],
  })

const setup = async (options?: IAgentOptions): Promise<boolean> => {

  const config = getConfig('./agent.yml')
  config.constants.databaseFile = databaseFile
  const { agent, db } = createObjects(config, { agent: '/agent', db: '/dbConnection' })
  serverAgent = agent
  dbConnection = db

  const agentRouter = AgentRouter({
    exposedMethods: serverAgent.availableMethods(),
  })

  const requestWithAgent = RequestWithAgentRouter({
    agent: serverAgent,
  })

  return new Promise((resolve) => {
    const app = express()
    app.use(basePath, requestWithAgent, agentRouter)
    restServer = app.listen(port, () => {
      resolve(true)
    })
  })
}

const tearDown = async (): Promise<boolean> => {
  restServer.close()
  await (await dbConnection).close()
  fs.unlinkSync(databaseFile)
  return true
}

const testContext = { getAgent, setup, tearDown }

describe('REST integration tests', () => {
  myPluginLogic(testContext)
})
