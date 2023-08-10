import type { DIDDocument } from 'did-resolver'
import type { MethodSpecificIdAlgo, CheqdNetwork } from '@cheqd/sdk'

import { VerificationMethods, createVerificationKeys, createDidVerificationMethod, createDidPayload } from '@cheqd/sdk'
import { rawSecp256k1PubkeyToRawAddress } from '@cosmjs/amino'
import { toBech32 } from '@cosmjs/encoding'
import pkg from 'secp256k1'
import { fromString } from 'uint8arrays'

import { SpecValidationResult } from '../types/types.js'
import { createHmac } from 'node:crypto'

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
  if (!isValidVerificationMethod(didDocument)) return { valid: false, error: 'verificationMethod publicKey is Invalid' }

  if (!isValidService(didDocument)) return { valid: false, error: 'Service is Invalid' }
  return { valid: true } as SpecValidationResult
}

export function isValidService(didDocument: DIDDocument) : boolean {
    return didDocument.service
    ? didDocument?.service?.every((s) => {
        return s?.serviceEndpoint && s?.id && s?.type
      })
    : true
}

export function isValidVerificationMethod(didDocument: DIDDocument) : boolean {
    if (!didDocument.verificationMethod) return false
    return didDocument.verificationMethod.every((vm) => {
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
  const { publicKeyConvert } = pkg
  return toBech32('cheqd', rawSecp256k1PubkeyToRawAddress(publicKeyConvert(fromString(kid, 'hex'), true)))
}

export function verifyHookSignature(signingKey: string, rawBody: string, expectedSignature: string): boolean {
  const hmac = createHmac('sha256', signingKey);
  hmac.update(rawBody);
  const signature = hmac.digest('hex');
  return signature === expectedSignature;
};

export async function fetchResponseBody(url: string): Promise<[string, string]> {
	const response = await fetch(url)
	const body = await response.arrayBuffer()
	return [response.headers.get("content-type")!, new TextDecoder().decode(body)]
}

export interface IDidDocOptions {
  verificationMethod: VerificationMethods
  verificationMethodId: any
  methodSpecificIdAlgo: MethodSpecificIdAlgo
  network: CheqdNetwork
  publicKey: string
}