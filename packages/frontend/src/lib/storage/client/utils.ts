import type { ClientStorageInterface } from './storage';

export async function checkHasInteractedInitial(keysetStorage: ClientStorageInterface): Promise<boolean> {
    const result = await keysetStorage.getItem("encryptedPrivateKey")

    if (result.success) return true

    return false
}