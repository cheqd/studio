import { LocalIdentity } from './local.js'
import { PostgresIdentity } from './postgres.js'
export { IIdentity } from './IIdentity.js'

import * as dotenv from 'dotenv'
dotenv.config()

export class Identity {
    private agent: LocalIdentity | PostgresIdentity

    static instance = new Identity().agent

    constructor() {
        if (process.env.ENABLE_EXTERNAL_DB == 'true') {
            this.agent = PostgresIdentity.instance
        } else {
            this.agent = LocalIdentity.instance
        }

        this.agent.initAgent()
    }
}