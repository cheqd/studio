import type { KeyPair } from "@stablelib/ed25519"

export type KeySet = {
    publicKey: string
    encryptedPrivateKey: SerializedWrappedEncryptedKeyWithIv
}

export type WrappedEncryptedKeyWithIv = {
    encryptedKey: string
    iv: string
}

export type SerializedWrappedEncryptedKeyWithIv = string

export type WrappedDecryptedKeyWithIv = {
    decryptedKey: KeyPair['secretKey']
    iv: Uint8Array
    toCryptoKey: () => Promise<CryptoKey>
}

export type WrappedEncryptedBlobWithIv = {
    encryptedBlob: string
    iv: string
}

export type SerializedWrappedEncryptedBlobWithIv = string

export type WrappedDecryptedBlobWithIv = {
    decryptedBlob: Uint8Array
    iv: Uint8Array
}

export type WrappedDecryptedBlobWithIvAndMetadata = WrappedDecryptedBlobWithIv & WrappedMetadata

export type WrappedEncryptedBlobWithIvAndMetadata = WrappedEncryptedBlobWithIv & WrappedMetadata

export type WrappedMetadata = WrappedClientMetadata & WrappedRemoteMetadata

export type WrappedRemoteMetadata = {
    etag?: string
    lastModified?: Date
}

export type WrappedClientMetadata = {
    created?: Date
    blobChecksum?: string
}