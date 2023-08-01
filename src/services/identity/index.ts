import { LocalIdentity } from './local.js'
import { PostgresIdentity } from './postgres.js'
export { IIdentity } from './IIdentity.js'

import * as dotenv from 'dotenv'
import { Unauthorized } from './unauthorized.js'
import { IIdentity } from './IIdentity.js'
dotenv.config()

export class Identity {
    agent: IIdentity
    static unauthorized = new Unauthorized()

    constructor(agentId?: string) {
        this.agent = Identity.unauthorized
        this.setupIdentityStrategy(agentId)
    }

    private setStrategy(strategy: IIdentity) {
        // If is already set up - skip
        if (this.agent !== strategy) return
        this.agent = strategy
    }

    public setupIdentityStrategy(agentId?: string) {
        if (process.env.ENABLE_EXTERNAL_DB === 'true') {
            if (agentId) {
                this.setStrategy(new PostgresIdentity())
            }
        } else {
            this.setStrategy(new LocalIdentity())
        }
    }
}