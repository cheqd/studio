/**
 * @public
 */
const schema = require('../plugin.schema.json')
export { schema }
export { CredentialIssuer } from './credential-w3c/action-handler'

export * from './types/vc-data-model'
