import { IIdentifier, IKey, IService, IAgentContext, IKeyManager, ManagedKeyInfo } from '@veramo/core'
import { AbstractIdentifierProvider } from '@veramo/did-manager'
import Multibase from 'multibase'
import Multicodec from 'multicodec'

type IContext = IAgentContext<IKeyManager>

/**
 * You can use this template for an `AbstractIdentifierProvider` implementation.
 *
 * Implementations of this interface are used by `@veramo/did-manager` to implement
 * CRUD operations for various DID methods.
 *
 * If you wish to implement support for a particular DID method, this is the type of class
 * you need to implement.
 *
 * If you don't want to customize this, then it is safe to remove from the template.
 *
 * @alpha
 */
export class CheqdDIDProvider extends AbstractIdentifierProvider {
  private defaultKms: string

  constructor(options: { defaultKms: string }) {
    super()
    this.defaultKms = options.defaultKms
  }

  async createIdentifier(
    { kms, alias }: { kms?: string; alias?: string },
    context: IContext
  ): Promise<Omit<IIdentifier, 'provider'>> {
    const key: ManagedKeyInfo = await context.agent.keyManagerImport({ kms: kms || this.defaultKms, type: 'Ed25519', privateKeyHex: '9e6fc361404de7c5b48ba40ebf0e9b4b33d0788fb1c979a5a02c9becba2ae1c054266e5e068d2f00c4336fca2dde002ec7d2d1ea1753dd6a0679feb069ffca22', publicKeyHex: '54266e5e068d2f00c4336fca2dde002ec7d2d1ea1753dd6a0679feb069ffca22' })

    /* const methodSpecificId = Buffer.from(
      Multibase.encode(
        'base58btc',
        Multicodec.addPrefix('ed25519-pub', Buffer.from(key.publicKeyHex, 'hex'))
      )
    ).toString().substr(0,32) */

    const methodSpecificId = 'z6fVEeX9YpnABifLvPTsgYmS4o5QGM77'

    const identifier: Omit<IIdentifier, 'provider'> = {
      did: 'did:cheqd:mainnet:' + methodSpecificId,
      controllerKeyId: key.kid,
      keys: [key],
      services: [],
    }

    // TODO: Implement custom debugger on creation.

    return identifier
  }

  async deleteIdentifier(identity: IIdentifier, context: IContext): Promise<boolean> {
    for( const { kid } of identity.keys ){
      await context.agent.keyManagerDelete({ kid })
    }
    return true
  }

  async addKey(
    { identifier, key, options }: { identifier: IIdentifier; key: IKey; options?: any },
    context: IContext
  ): Promise<any> {
    throw Error('CheqdDIDProvider addKey not supported yet.')
  }

  async addService(
    { identifier, service, options }: { identifier: IIdentifier; service: IService; options?: any },
    context: IContext
  ): Promise<any> {
    throw Error('CheqdDIDProvider addService not supported yet.')
  }

  async removeKey(args: { identifier: IIdentifier; kid: string; options?: any }, context: IContext): Promise<any> {
    throw Error('CheqdDIDProvider removeKey not supported yet.')
  }

  async removeService(args: { identifier: IIdentifier; id: string; options?: any }, context: IContext): Promise<any> {
    throw Error('CheqdDIDProvider removeService not supported yet.')
  }
}
