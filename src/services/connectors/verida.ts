import type { EnvironmentType } from '@verida/types'
import { Context, Network } from '@verida/client-ts'
import { AutoAccount } from '@verida/account-node'

import type { CredentialDataRecord, DataRecord } from '../../types/verida.js'
import { VERIDA_APP_NAME, VERIDA_CREDENTIAL_RECORD_SCHEMA } from '../../types/constants.js'

import * as dotenv from 'dotenv'
import type { VerifiableCredential } from '@veramo/core'
dotenv.config()

const { VERIDA_NETWORK, POLYGON_RPC_URL, VERIDA_PRIVATE_KEY, POLYGON_PRIVATE_KEY } = process.env

/**
 * Helper class for the Verida protocol.
 *
 * Run the init method before running any other method.
 */
export class VeridaService {
  private context?: Context
  private account?: AutoAccount

  static instance = new VeridaService()

  /**
   * Initialise the Verida account and context.
   *
   * @param environment The Verida environment.
   * @param contextName The Context name of the application.
   * @param accountPrivateKey The private key of the account
   */
  async init(
    environment: EnvironmentType,
    contextName: string,
    accountPrivateKey: string,
    polygonPrivateKey: string
  ) {
    if(this.context && this.account) {
        return
    }
    this.account = new AutoAccount({
      privateKey: accountPrivateKey,
      environment,
      didClientConfig: {
        callType: 'web3',
        web3Config: {
          rpcUrl: POLYGON_RPC_URL,
          privateKey: polygonPrivateKey, // Polygon private key for creating DID, not needed in our case but required in the current version of the config.
        },
      },
    })
    try {
        this.context = await Network.connect({
            client: {
                environment,
            },
            context: {
                name: contextName,
            },
            account: this.account,
        })
    } catch (error) {
        throw new Error(`Error: ${error}`)
    }
  }

  /**
   * Send data to a DID via the Verida protocol.
   *
   * @param recipientDid The DID of the recipient.
   * @param subject The subject of the message (similar to an email subject).
   * @param data The data to be sent.
   */
  async sendData(recipientDid: string, subject: string, data: DataRecord) {
    try {
        if(!this.context) {
            await VeridaService.instance.init(
              VERIDA_NETWORK,
              VERIDA_APP_NAME,
              VERIDA_PRIVATE_KEY,
              POLYGON_PRIVATE_KEY
            )
        }

        const messagingClient = await this.context?.getMessaging()

        const messageType = 'inbox/type/dataSend' // There are different types of message, here we are sending some data.
        const messageData = {
          data: [data],
        }
        const messageConfig = {
          recipientContextName: 'Verida: Vault', // The inbox of a DID is on the 'Verida: Vault' context. This context is the private space of this DID.
          did: recipientDid,
        }

        await messagingClient?.send(
          recipientDid,
          messageType,
          messageData,
          subject,
          messageConfig
        )
    } catch (error) {
        throw new Error(`Error sending data ${error}`)
    }
  }

  /**
   * Send a Verifiable Credential to a DID via the Verida protocol.
   *
   * @param recipientDid  The DID of the recipient.
   * @param messageSubject The subject of the message in which the Credential will be sent to the recipient (similar to an email subject).
   * @param credential The credential itself.
   * @param credentialName The name of the credential. For instance, will be displayed in the Verida Wallet UI.
   * @param credentialSummary A summary of the credential. For instance, will be displayed in the Verida Wallet UI.
   */
  async sendCredential(
    recipientDid: string,
    messageSubject: string,
    credential: VerifiableCredential,
    credentialName: string,
    credentialSchema: string,
    credentialSummary?: string
  ) {
    // The Credential record is how Verida wrap the credential to store it on the Network. Check the JSdoc of the type and each property. They are following the Verida Credential Record schema.
    const credentialRecord: CredentialDataRecord = {
      name: credentialName,
      summary: credentialSummary,
      schema: VERIDA_CREDENTIAL_RECORD_SCHEMA,
      didJwtVc: credential.proof.jwt,
      credentialSchema,
      credentialData: credential,
    }
    await this.sendData(recipientDid, messageSubject, credentialRecord)
  }
}