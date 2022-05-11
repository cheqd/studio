import { getConfig } from '@veramo/cli/build/setup'
import { createObjects } from '@veramo/cli/build/lib/objectCreator'
import { Connection } from 'typeorm'

import fs from 'fs'

jest.setTimeout(30000)

// Shared tests
import myPluginLogic from './shared/myPluginLogic'
import myPluginEventsLogic from './shared/myPluginEventsLogic'

let dbConnection: Promise<Connection>
let agent: any

const setup = async (): Promise<boolean> => {

  const config = getConfig('./agent.yml')

  const { localAgent, db } = createObjects(config, { localAgent: '/agent', db: '/dbConnection' })
  agent = localAgent
  dbConnection = db

  return true
}

const tearDown = async (): Promise<boolean> => {
  await (await dbConnection).close()
  fs.unlinkSync('./database.sqlite')
  return true
}

const getAgent = () => agent

const testContext = { getAgent, setup, tearDown }

describe('Local integration tests', () => {
  myPluginLogic(testContext)
  myPluginEventsLogic(testContext)
})
