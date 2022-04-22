import {
    createAgent,
    IDIDManager,
    IResolver,
    IDataStore,
    IKeyManager,
    IIdentifier,
    TAgent,
} from '@veramo/core'
import { DIDManager, MemoryDIDStore } from '@veramo/did-manager'
import { EthrDIDProvider } from '@veramo/did-provider-ethr'
import { WebDIDProvider } from '@veramo/did-provider-web'
import { KeyManager, MemoryKeyStore, MemoryPrivateKeyStore } from '@veramo/key-manager'
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local'
import { DIDResolverPlugin } from '@veramo/did-resolver'
import { Resolver } from 'did-resolver'
import { CredentialIssuer } from '@veramo/credential-w3c'
import { getResolver as EthrDIDResolver } from 'ethr-did-resolver'
import { getResolver as WebDIDResolver } from 'web-did-resolver'

import { INFURA_PROJECT_ID} from '../constants'

export class Identity {

    agent: TAgent<any> | null | undefined

    constructor(agent?: TAgent<any>, mode?: string) {
        this.agent = agent
        if( mode === 'demo' ) return
        if( !agent ) this.init_agent()
    }

    init_agent(): void {
        //@ts-ignore
        this.agent = createAgent<IDIDManager & IKeyManager & IDataStore & IResolver>({
            plugins: [
                new KeyManager({
                    store: new MemoryKeyStore(),
                    kms: {
                        local: new KeyManagementSystem(
                            new MemoryPrivateKeyStore()
                        )
                    }
                }),
                //@ts-ignore
                new DIDManager({
                    store: new MemoryDIDStore(),
                    defaultProvider: 'did:ethr:rinkeby',
                    providers: {
                        'did:ethr:rinkeby': new EthrDIDProvider({
                            defaultKms: 'local',
                            network: 'rinkeby',
                            rpcUrl: `https://rinkeby.infura.io/v3/${INFURA_PROJECT_ID}`
                        }),
                        'did:web': new WebDIDProvider({
                            defaultKms: 'local'
                        })
                    }
                }),
                new DIDResolverPlugin({
                    resolver: new Resolver({
                        ...EthrDIDResolver({ infuraProjectId: INFURA_PROJECT_ID }),
                        ...WebDIDResolver(),
                    })
                }),
                new CredentialIssuer()
            ]
        })
    }

    async create_demo_id(request: Request, agent: TAgent<any>): Promise<IIdentifier> {
        if( !this.agent && !agent ) throw new Error('No initialised agent found.')

        if( agent ) this.agent = agent

        const identity = await agent.execute(
            'didManagerCreate',
            {}
        )

        return identity
    }
}