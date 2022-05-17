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

        const key: MinimalImportableKey = { kms: kms, type: 'Ed25519', kid: '***REMOVED***', privateKeyHex: '***REMOVED***', publicKeyHex: '***REMOVED***' }

        const methodSpecificId = '***REMOVED***'

        const identifier: IIdentifier = await this.agent!.didManagerImport({ keys: [ key ], did: '***REMOVED***' + methodSpecificId, controllerKeyId: key.kid } as MinimalImportableIdentifier)

        return identifier
    }
}