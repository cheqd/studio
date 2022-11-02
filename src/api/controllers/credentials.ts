import {
	createAgent, IDataStore, IDIDManager, IKeyManager, IResolver, TAgent
} from '@veramo/core'
import { CredentialIssuer } from '@veramo/credential-w3c'
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
				new CredentialIssuer(),
			]
		})
	}

	async issue_credentials(request: Request, user: GenericAuthUser, subjectId?: string): Promise<Response> {

		if (!this.agent) this.init_agent()

		const identity_handler = new Identity(
			this.agent,
			'demo'
		)

		const issuer_id = await identity_handler.load_issuer_did(
			request,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.agent as TAgent<any>
		)

		this.agent = identity_handler.agent

		const credential_subject: CredentialSubject = {
			id: subjectId,
			type: undefined
		}
		console.log('entered')
		let credential: CredentialPayload
		switch('Ticket') {
			case 'Ticket':
				credential = {
					issuer: { id: issuer_id.did },
					'@context': VC_CONTEXT.concat(VC_EVENTRESERVATION_CONTEXT),
					type: ['EventReservation', VC_TYPE],
					reservationId: 'https://schema.org/ReservationConfirmed',
					reservationStatus: 'https://schema.org/ReservationConfirmed',
					underName: {
						'@type': 'Person',
						name: `${user?.nickname}` ?? '<unknown>',
					},
					reservationFor: {
						'@type': 'Event',
						name: 'IIW Event',
						startDate: "2022-11-06T19:30:00-08:00",
						logo: ''
					},
					reservedTicket: {
						'@type': 'Ticket',
						ticketNumber: 'abc123'
					}
				}
				break
			default:
				credential = {
					issuer: { id: issuer_id.did },
					'@context': VC_CONTEXT.concat(VC_PERSON_CONTEXT),
					type: ['Person', VC_TYPE],
					issuanceDate: new Date().toISOString(),
					credentialSubject: credential_subject,
					'WebPage': [
						{
							'@type': 'ProfilePage',
							description: 'Twitter',
							name: `${user?.nickname}` ?? '<unknown>',
							identifier: `@${user?.handle}` ?? '<unknown>',
							URL: `https://twitter.com/${user?.handle}`,
							lastReviewed: user?.updated_at
						}
					],
				}
		}
		

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
