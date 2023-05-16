import type { DIDDocument } from 'did-resolver'
import type { MethodSpecificIdAlgo, CheqdNetwork } from '@cheqd/sdk'

import { VerificationMethods, createVerificationKeys, createDidVerificationMethod, createDidPayload } from '@cheqd/sdk'
import { rawSecp256k1PubkeyToRawAddress } from '@cosmjs/amino'
import { toBech32 } from '@cosmjs/encoding'
import { publicKeyConvert } from 'secp256k1'
import { fromString } from 'uint8arrays'

import { SpecValidationResult } from '../types/types'

export function validateSpecCompliantPayload(didDocument: DIDDocument): SpecValidationResult {
  // id is required, validated on both compile and runtime
  if (!didDocument.id && !didDocument.id.startsWith('did:cheqd:')) return { valid: false, error: 'id is required' }

  // verificationMethod is required
  if (!didDocument.verificationMethod) return { valid: false, error: 'verificationMethod is required' }

  // verificationMethod must be an array
  if (!Array.isArray(didDocument.verificationMethod))
    return { valid: false, error: 'verificationMethod must be an array' }

  // verificationMethod must be not be empty
  if (!didDocument.verificationMethod.length) return { valid: false, error: 'verificationMethod must be not be empty' }

  // verificationMethod types must be supported
  const isValidVerificationMethod = didDocument.verificationMethod.every((vm) => {
    switch (vm.type) {
      case VerificationMethods.Ed255192020:
        return vm.publicKeyMultibase != null
      case VerificationMethods.JWK:
        return vm.publicKeyJwk != null
      case VerificationMethods.Ed255192018:
        return vm.publicKeyBase58 != null
      default:
        return false
    }
  })

  if (!isValidVerificationMethod) return { valid: false, error: 'verificationMethod publicKey is Invalid' }

  const isValidService = didDocument.service
    ? didDocument?.service?.every((s) => {
        return s?.serviceEndpoint && s?.id && s?.type
      })
    : true

  if (!isValidService) return { valid: false, error: 'Service is Invalid' }
  return { valid: true } as SpecValidationResult
}

export function generateDidDoc(options: IDidDocOptions) {
  const { verificationMethod, methodSpecificIdAlgo, verificationMethodId, network, publicKey } = options
  const verificationKeys = createVerificationKeys(publicKey, methodSpecificIdAlgo, verificationMethodId, network)
  if (!verificationKeys) {
    throw new Error('Invalid DID options')
  }
  const verificationMethods = createDidVerificationMethod([verificationMethod], [verificationKeys])

  return createDidPayload(verificationMethods, [verificationKeys])
}

export function getCosmosAccount(kid: string) {
  return toBech32('cheqd', rawSecp256k1PubkeyToRawAddress(publicKeyConvert(fromString(kid, 'hex'), true)))
}

export interface IDidDocOptions {
  verificationMethod: VerificationMethods
  verificationMethodId: any
  methodSpecificIdAlgo: MethodSpecificIdAlgo
  network: CheqdNetwork
  publicKey: string
}