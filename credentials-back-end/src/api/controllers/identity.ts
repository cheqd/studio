import {
    IIdentifier,
    ManagedKeyInfo,
    MinimalImportableIdentifier,
    MinimalImportableKey,
    TAgent,
} from '@veramo/core'

export class Identity {

    agent: TAgent<any> | undefined

    constructor(agent?: TAgent<any>, mode?: string) {
        this.agent = agent
        if( mode === 'demo' ) return
    }

    async load_issuer_did(request: Request, agent: TAgent<any>): Promise<IIdentifier> {
        if( !this.agent && !agent ) throw new Error('No initialised agent found.')

        if( agent ) this.agent = agent

        const [ kms ] = await this.agent!.keyManagerGetKeyManagementSystems()

        const key: MinimalImportableKey = { kms: kms, type: 'Ed25519', kid: 'jaa70K9yy4Tw-YEsA2T4F10jsQuFdpVJN9LLhjmOUGw', privateKeyHex: '0019f40cdd2b9ee6807d9d6fb66cb775e95d6e1dac039bb2a93a9a08263a9fe28da6bbd0af72cb84f0f9812c0364f8175d23b10b8576954937d2cb86398e506c', publicKeyHex: '8da6bbd0af72cb84f0f9812c0364f8175d23b10b8576954937d2cb86398e506c' }

        const methodSpecificId = 'zAXwwqZzhCZA1L77ZBa8fhVNjL9MQCHX'

        const identifier: IIdentifier = await this.agent!.didManagerImport({ keys: [ key ], did: 'did:cheqd:mainnet:' + methodSpecificId, controllerKeyId: key.kid } as MinimalImportableIdentifier)

        return identifier
    }
}