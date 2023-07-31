import { LocalIdentity } from './local.js'
import { PostgresIdentity } from './postgres.js'
export { IIdentity } from './IIdentity.js'

import * as dotenv from 'dotenv'
import { Unauthorized } from './unauthorized.js'
dotenv.config()

export class Identity {
    private agent: LocalIdentity | PostgresIdentity

    static instance = new Identity().agent
    static unauthorized = new Unauthorized()

    constructor() {
        if (process.env.ENABLE_EXTERNAL_DB === 'true') {
            this.agent = new PostgresIdentity()
        } else {
            this.agent = new LocalIdentity()
        }
    }
}
