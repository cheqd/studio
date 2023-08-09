import { LocalIdentity } from './local.js'
import { PostgresIdentity } from './postgres.js'
import { IIdentity } from './IIdentity.js'
import { Unauthorized } from './unauthorized.js'

import * as dotenv from 'dotenv'
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
        if (this.agent === strategy) return
        this.agent = strategy
    }

    public setupIdentityStrategy(agentId?: string) {
        if (agentId) {
            if (process.env.ENABLE_EXTERNAL_DB === 'true') {
                this.setStrategy(new PostgresIdentity())
            } else {
                this.setStrategy(new LocalIdentity())
            }
        }
    }
}
