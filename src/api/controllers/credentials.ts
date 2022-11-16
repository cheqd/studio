import {
	createAgent, IDataStore, IDIDManager, IKeyManager, IResolver, TAgent
} from '@veramo/core'
import { CredentialPlugin } from '@veramo/credential-w3c'
import { AbstractIdentifierProvider, DIDManager, MemoryDIDStore } from '@veramo/did-manager'
import { DIDResolverPlugin } from '@veramo/did-resolver'
import { KeyManager, MemoryKeyStore, MemoryPrivateKeyStore } from '@veramo/key-manager'
import { KeyManagementSystem } from '@veramo/kms-local'
import { Resolver, ResolverRegistry } from 'did-resolver'
import { CheqdDIDProvider, getResolver as CheqdDidResolver } from '@cheqd/did-provider-cheqd'
import { NetworkType } from '@cheqd/did-provider-cheqd/src/did-manager/cheqd-did-provider'
import { HEADERS, VC_CONTEXT, VC_EVENTRESERVATION_CONTEXT, VC_PERSON_CONTEXT, VC_PROOF_FORMAT, VC_REMOVE_ORIGINAL_FIELDS, VC_TICKET_CONTEXT, VC_TYPE, } from '../constants'
import { CredentialPayload, CredentialRequest, CredentialSubject, GenericAuthUser, VerifiableCredential } from '../types'
import { Identity } from './identity'

export class Credentials {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	agent: TAgent<any>

	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
	constructor(agent?: any) {
		this.agent = agent
		if (!agent) this.init_agent()
	}

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
								cosmosPayerMnemonic: COSMOS_PAYER_MNEMONIC,
								networkType: network,
								rpcUrl: NETWORK_RPC_URL,
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

	async issue_person_credential(user: GenericAuthUser, provider: string, subjectId?: string): Promise<Response> {
		const credential_subject: CredentialSubject = {
			id: subjectId,
			type: undefined
		}
		
		const webpage:any = {
			'@type': 'ProfilePage',
			description: provider,
			name: `${user?.nickname}` ?? '<unknown>',
			identifier: `@${user?.nickname}` ?? '<unknown>',
			lastReviewed: user?.updated_at
		}

		if(provider=='github' || provider == 'twitter') {
			webpage.URL=`https://${provider.toLowerCase()}.com/${user?.nickname}`
		}

		const credential = {
			'@context': VC_CONTEXT.concat(PERSON_CONTEXT ? [PERSON_CONTEXT] : VC_PERSON_CONTEXT),
			type: ['Person', VC_TYPE],
			issuanceDate: new Date().toISOString(),
			credentialSubject: credential_subject,
			'WebPage': [webpage]
		}

		return await this.issue_credentials(credential)
	}

	async issue_ticket_credential(reservationId: string, subjectId?: string): Promise<Response> {
		const credential_subject: CredentialSubject = {
			id: subjectId,
			type: undefined
		}

		const credential = {
			'@context': VC_CONTEXT.concat(EVENT_CONTEXT ? [EVENT_CONTEXT] : VC_EVENTRESERVATION_CONTEXT),
			type: ['EventReservation', VC_TYPE],
			issuanceDate: new Date().toISOString(),
			credentialSubject: credential_subject,
			reservationId,
			reservationStatus: 'https://schema.org/ReservationConfirmed',
			reservationFor: {
				'@type': 'Event',
				name: 'Internet Identity Workshop IIWXXXV',
				startDate: "2022-11-16T16:00:00",
				endDate: "2022-11-18T00:00:00",
				location: "Computer History Museum, 1401 N Shoreline Blvd, Mountain View, CA 94043",
				logo: 'https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:z6jKUJA5YcZsNxZgsrQPKPipL2FRTf4s/resources/8140ec3a-d8bb-4f59-9784-a1cbf91a4a35'
			}
		}

		return await this.issue_credentials(credential)
	}

	async issue_credentials(credential: CredentialPayload): Promise<Response> {

		if (!this.agent) this.init_agent()

		const identity_handler = new Identity(
			this.agent,
			'demo'
		)

		const issuer_id = await identity_handler.load_issuer_did(
			this.agent as TAgent<any>
		)
		credential.issuer = { id: issuer_id.did }

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

		return new Response(
			JSON.stringify(
				verifiable_credential,
				null,
				2
			),
			{
				status: 200,
				headers: {
					...HEADERS.json,
					"access-control-allow-origin": "*"
				}
			}
		)
	}

	async verify_credentials(request: CredentialRequest): Promise<Response> {
		if (request?.headers && (!request?.headers?.get('Content-Type') || request?.headers?.get('Content-Type') != 'application/json')) return new Response(JSON.stringify({ error: 'Unsupported media type.' }), { status: 405, headers: HEADERS.json })

		const credential = request?.credential

		if (!credential) return new Response(JSON.stringify({ error: 'W3C Verifiable credential is not provided.' }), { status: 400, headers: HEADERS.json })

		const verified = await this.agent?.execute(
			'verifyCredential',
			{
				credential: credential
			}
		)

		return new Response(
			JSON.stringify(
				{
					verified: verified
				}
			),
			{
				headers: {
					...HEADERS.json,
					"access-control-allow-origin": "*"
				}
			}
		)
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
