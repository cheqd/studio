import { LocalIdentity } from './local.js'
import { PostgresIdentity } from './postgres.js'

export { IIdentity } from './IIdentity.js'

export const Identity = process.env.ENABLE_EXTERNAL_DB ? new PostgresIdentity() : new LocalIdentity()