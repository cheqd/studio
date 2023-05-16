import { generateKeyPairFromSeed, type KeyPair } from '@stablelib/ed25519'
import { Buffer } from 'buffer'
import { fromString, toString } from 'uint8arrays'
import type { SerializedWrappedEncryptedKeyWithIv, WrappedEncryptedKeyWithIv, WrappedDecryptedKeyWithIv } from './types'

export async function deriveSeedFromPassphrase(passphrase: string, userId: string): Promise<Uint8Array> {
    // generate salt from constant input
    const salt = await generateSaltFromConstantInput(userId)

    // import passphrase as key
    const key = await crypto.subtle.importKey(
        'raw',
        Buffer.from(passphrase),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
    )

    // derive key from passphrase
    const derivedKey = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt,
            iterations: 100_000,
            hash: 'SHA-256',
        } satisfies Pbkdf2Params,
        key,
        256,
    )

    return new Uint8Array(derivedKey)
}

export async function generateSaltFromConstantInput(userId: string): Promise<Uint8Array> {
    const derivedSource = await crypto.subtle.importKey(
        'raw',
        Buffer.from(userId),
        { name: 'PBKDF2', hash: 'SHA-256' },
        false,
        ['deriveBits', 'deriveKey']
    )

    const salt = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: Buffer.from(userId),
            iterations: 10_000_000,
            hash: 'SHA-256',
        } satisfies Pbkdf2Params,
        derivedSource,
        256,
    )

    return new Uint8Array(salt)
}

export async function deriveAsymmetricKeysFromSeed(seed: Uint8Array): Promise<KeyPair> {
    return generateKeyPairFromSeed(seed)
}

export async function deriveSymmetricKeyFromPassphrase(passphrase: string, userId: string, iterations = 10_000_000): Promise<CryptoKey> {
    // generate salt from constant input
    const salt = await generateSaltFromConstantInput(userId)

    // import passphrase as key
    const key = await crypto.subtle.importKey(
        'raw',
        Buffer.from(passphrase),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
    )

    // derive key from passphrase
    const derivedKey = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations, // 10x iterations since outcome is exposed in client storage, around 1s
            hash: 'SHA-256',
        } satisfies Pbkdf2Params,
        key,
        {
            name: 'AES-GCM',
            length: 256,
        } satisfies AesKeyGenParams,
        false,
        ['encrypt', 'decrypt']
    )

    return derivedKey
}

export async function encryptPrivateKeyWithPassphrase(privateKey: KeyPair['secretKey'], passphrase: string, userId: string): Promise<SerializedWrappedEncryptedKeyWithIv> {
    // derive key from passphrase
    const derivedKey = await deriveSymmetricKeyFromPassphrase(passphrase, userId)

    // generate random iv
    const iv = crypto.getRandomValues(new Uint8Array(12))

    // encrypt private key with derived key
    const encrypted = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv,
        } satisfies AesGcmParams,
        derivedKey,
        Buffer.from(privateKey)
    )

    // wrap encrypted key with iv
    const encryptedKeyWithIv = {
        iv: toString(iv, 'base64'),
        encryptedKey: Buffer.from(encrypted).toString('base64'),
    } satisfies WrappedEncryptedKeyWithIv

    // return base64 encoded string from JSON
    return toString(new TextEncoder().encode(JSON.stringify(encryptedKeyWithIv)), 'base64')
}

export async function decryptPrivateKeyWithPassphrase(encryptedPrivateKey: string, passphrase: string, userId: string): Promise<WrappedDecryptedKeyWithIv> {
    // derive key from passphrase
    const derivedKey = await deriveSymmetricKeyFromPassphrase(passphrase, userId)

    // unwrap encrypted key with iv
    const { encryptedKey, iv } = JSON.parse(toString(fromString(encryptedPrivateKey, 'base64'), 'utf-8')) satisfies WrappedEncryptedKeyWithIv

    // decrypt private key with derived key
    const decrypted = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: Buffer.from(iv, 'base64'),
        } satisfies AesGcmParams,
        derivedKey,
        Buffer.from(encryptedKey, 'base64')
    )

    // construct decrypted key with iv
    const decryptedKeyWithIv = {
        iv: fromString(iv, 'base64'),
        decryptedKey: new Uint8Array(decrypted),
        toCryptoKey: async () => await toCryptoKey(decrypted),
    } satisfies WrappedDecryptedKeyWithIv

    return decryptedKeyWithIv
}

export async function toCryptoKey(rawKey: ArrayBuffer): Promise<CryptoKey> {
    // get sha-256 hash of raw key, downsize to 256 bits
    const hash = await crypto.subtle.digest('SHA-256', rawKey)

    // import key as AES-GCM
    return await crypto.subtle.importKey('raw', Buffer.from(hash), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
}