import { deriveSeedFromPassphrase, deriveAsymmetricKeysFromSeed, encryptPrivateKeyWithPassphrase, decryptPrivateKeyWithPassphrase } from './key'
import type { KeySet, WrappedEncryptedBlobWithIv, SerializedWrappedEncryptedBlobWithIv } from './types';
import { trim, normalizeUnicode } from './utils';
import { fromString, toString } from 'uint8arrays';
import { Buffer } from 'buffer';
import type { WrappedEncryptedBlobWithIvAndMetadata, WrappedDecryptedBlobWithIvAndMetadata, WrappedClientMetadata } from './types';

export async function normalizePassphrase(passphrase: string): Promise<string> {
    return normalizeUnicode(trim(passphrase))
}

export async function generateKeySet(passphrase: string, userId: string): Promise<KeySet> {
    const normalizedPassphrase = await normalizePassphrase(passphrase)
    const seed = await deriveSeedFromPassphrase(normalizedPassphrase, userId)
    const keyPair = await deriveAsymmetricKeysFromSeed(seed)
    const encryptedPrivateKey = await encryptPrivateKeyWithPassphrase(keyPair.secretKey, normalizedPassphrase, userId)
    return {
        publicKey: `0x${toString(keyPair.publicKey, 'hex')}`,
        encryptedPrivateKey,
    }
}

export async function encryptSecretBox(
    message: string,
    passphrase: string,
    encryptedSecretKey: string,
    userId: string,
): Promise<SerializedWrappedEncryptedBlobWithIv> {
    // normalize passphrase
    const normalizedPassphrase = await normalizePassphrase(passphrase)

    // decrypt secret key
    const secretKey = await decryptPrivateKeyWithPassphrase(encryptedSecretKey, normalizedPassphrase, userId)

    // generate random iv
    const iv = crypto.getRandomValues(new Uint8Array(12))

    // encrypt message with secret key
    const encrypted = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv,
        } as AesGcmParams,
        await secretKey.toCryptoKey(),
        Buffer.from(message)
    )

    // return base64 encoded string from JSON
    return await serializeSecretBox({ encryptedBlob: Buffer.from(encrypted).toString('base64'), iv: toString(iv, 'base64'), blobChecksum: Buffer.from(await crypto.subtle.digest('SHA-256', fromString(message, 'utf-8'))).toString('hex'), created: new Date() } as WrappedEncryptedBlobWithIv & WrappedClientMetadata)
}

export async function decryptSecretBox(
    message: string,
    passphrase: string,
    encryptedSecretKey: string,
    userId: string,
): Promise<WrappedDecryptedBlobWithIvAndMetadata> {
    // normalize passphrase
    const normalizedPassphrase = await normalizePassphrase(passphrase)

    // decrypt secret key
    const secretKey = await decryptPrivateKeyWithPassphrase(encryptedSecretKey, normalizedPassphrase, userId)

    // unwrap encrypted blob with iv
    const { encryptedBlob, iv, blobChecksum, created } = await deserializeSecretBox<WrappedEncryptedBlobWithIvAndMetadata>(message)

    // decrypt blob with secret key
    const decrypted = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: fromString(iv, 'base64'),
        } as AesGcmParams,
        await secretKey.toCryptoKey(),
        Buffer.from(encryptedBlob, 'base64')
    )

    // construct decrypted message with iv
    const decryptedMessageWithIv = {
        decryptedBlob: new Uint8Array(decrypted),
        iv: fromString(iv, 'base64'),
        blobChecksum,
        created,
    } as WrappedDecryptedBlobWithIvAndMetadata

    return decryptedMessageWithIv
}

export async function serializeSecretBox<T extends WrappedEncryptedBlobWithIv = WrappedEncryptedBlobWithIv>(
    wrappedMessage: T,
): Promise<SerializedWrappedEncryptedBlobWithIv> {
    return toString(fromString(JSON.stringify(wrappedMessage), 'utf-8'), 'base64') as SerializedWrappedEncryptedBlobWithIv
}

export async function deserializeSecretBox<T extends WrappedEncryptedBlobWithIv = WrappedEncryptedBlobWithIv>(
    serializedWrappedMessage: SerializedWrappedEncryptedBlobWithIv,
): Promise<T> {
    const parsed = JSON.parse(toString(fromString(serializedWrappedMessage, 'base64'), 'utf-8'))

    return { ...parsed, lastModified: parsed.lastModified ? new Date(parsed.lastModified) : undefined } as T
}