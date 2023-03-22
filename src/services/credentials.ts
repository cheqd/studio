import {
  createAgent,
  IDataStore,
  IDIDManager,
  IKeyManager,
  IResolver,
  IVerifyResult,
  TAgent,
  W3CVerifiableCredential
} from '@veramo/core'
import { CredentialPlugin } from '@veramo/credential-w3c'
import { AbstractIdentifierProvider, DIDManager, MemoryDIDStore } from '@veramo/did-manager'
import { DIDResolverPlugin } from '@veramo/did-resolver'
import { KeyManager, MemoryKeyStore, MemoryPrivateKeyStore } from '@veramo/key-manager'
import { KeyManagementSystem } from '@veramo/kms-local'
import { Resolver, ResolverRegistry } from 'did-resolver'
import { CheqdDIDProvider, getResolver as CheqdDidResolver } from '@cheqd/did-provider-cheqd'

import { VC_CONTEXT, VC_PROOF_FORMAT, VC_REMOVE_ORIGINAL_FIELDS, VC_TYPE } from '../types/constants'
import { CredentialPayload, CredentialRequest, VerifiableCredential, Credential } from '../types/types'
import { Identity } from './identity'

require('dotenv').config()

const { 
  ISSUER_ID,
  COSMOS_PAYER_MNEMONIC,
  NETWORK_RPC_URL,
} = process.env

export enum DefaultRPCUrl {
  Mainnet = 'https://rpc.cheqd.net',
  Testnet = 'https://rpc.cheqd.network'
}

export enum NetworkType {
  Mainnet = "mainnet",
  Testnet = "testnet"
}

export enum DefaultResolverUrl {
  Cheqd = "https://resolver.cheqd.net"
}

export class Credentials {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	agent: TAgent<any>

	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
	constructor(agent?: any) {
		this.agent = agent
		if (!agent) this.init_agent()
	}

    public static instance = new Credentials()

	init_agent(): void {
		const network = this.get_network_ns_config(ISSUER_ID)
		const providerPrefix = `did:cheqd:${network as string}`

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
				new DIDManager({
					store: new MemoryDIDStore(),
					defaultProvider: providerPrefix,
					providers: {
						providerPrefix: new CheqdDIDProvider(
							{
								defaultKms: 'local',
								cosmosPayerSeed: COSMOS_PAYER_MNEMONIC,
								networkType: network,
								rpcUrl: NETWORK_RPC_URL || (network === NetworkType.Testnet ? DefaultRPCUrl.Testnet : DefaultRPCUrl.Mainnet),
							}
						) as AbstractIdentifierProvider
					}
				}),
				new DIDResolverPlugin({
					resolver: new Resolver({
						...CheqdDidResolver() as ResolverRegistry
					})
				}),
				new CredentialPlugin(),
			]
		})
	}

    async issue_credential(request: CredentialRequest): Promise<Credential> {

		if (!this.agent) this.init_agent()

		const identity_handler = new Identity(
			this.agent,
			'demo'
		)
		const issuer_id = await identity_handler.load_issuer_did(
			this.agent as TAgent<any>
		)

        const credential: CredentialPayload = {
            '@context': [ ...request['@context'] || [], ...VC_CONTEXT ],
            type: [ ...request.type || [], VC_TYPE ],
            issuer: { id: issuer_id.did },
            credentialSubject: {
                id: request.subjectDid,
                type: undefined
            },
            issuanceDate: new Date().toISOString(),
            ...request.attributes
        }

        if(request.expirationDate) {
            credential.expirationDate = request.expirationDate
        }

		this.agent = identity_handler.agent

		const verifiable_credential: Omit<VerifiableCredential, 'vc'> = await this.agent.execute(
			'createVerifiableCredential',
			{
				save: false,
				credential,
				proofFormat: VC_PROOF_FORMAT,
				removeOriginalFields: VC_REMOVE_ORIGINAL_FIELDS
			}
		)

		if (verifiable_credential?.vc) delete verifiable_credential.vc
		if (verifiable_credential?.sub) delete verifiable_credential.sub
		if (verifiable_credential?.iss) delete verifiable_credential.iss
		if (verifiable_credential?.nbf) delete verifiable_credential.nbf
		if (verifiable_credential?.exp) delete verifiable_credential.exp

        return verifiable_credential
	}

	async verify_credentials(credential: W3CVerifiableCredential | string): Promise<IVerifyResult> {
		const result = await this.agent?.execute(
			'verifyCredential',
			{
				credential
			}
		)
        delete(result.payload)
        return result
	}

	private get_network_ns_config(issuer_id: string): NetworkType {
		// did:cheqd:<network>:<uuid>
		const parts = issuer_id.split(':')
		const ns = parts[2]

		return this.validateNetworkNS(ns as NetworkType)
	}

	validateNetworkNS(ns: NetworkType): NetworkType {
		return ns
	}
}
