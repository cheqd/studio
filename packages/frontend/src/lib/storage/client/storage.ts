// dynamic import of encrypt-storage
/* const EncryptStorage = (await import('encrypt-storage/dist')).EncryptStorage */
// static import of encrypt-storage
// import { EncryptStorage } from 'encrypt-storage/dist'
// import type { EncryptStorageOptions, GetFromPatternOptions, RemoveFromPatternOptions } from 'encrypt-storage/dist/types'
import { z, type SafeParseReturnType } from 'zod'

export const ClientStorageTypes = {
    LocalStorage: 'localStorage',
    SessionStorage: 'sessionStorage'
} as const

export type ClientStorageType = typeof ClientStorageTypes[keyof typeof ClientStorageTypes]

export type SessionClientStorage = ClientStorageInterface & { type: typeof ClientStorageTypes.SessionStorage }

export type LocalClientStorage = ClientStorageInterface & { type: typeof ClientStorageTypes.LocalStorage }

export interface ClientStorageInterface {
    readonly type: ClientStorageType
    readonly options: EncryptStorageOptions
    getItem(key: string): Promise<SafeParseReturnType<string, string>>
    getMultipleItems(keys: string[]): Promise<SafeParseReturnType<Record<string, string | undefined>, Record<string, string | undefined>>>
    setItem(key: string, value: string): Promise<void>
    setMultipleItems<T extends [string, string][]>(items: T): Promise<void>
    removeItem(key: string): Promise<void>
    getItemFromPattern(pattern: string, options?: GetFromPatternOptions): Promise<SafeParseReturnType<string, string>>
    removeItemFromPattern(pattern: string, options?: RemoveFromPatternOptions): Promise<void>
    clear(): Promise<void>
    key(index: number): Promise<SafeParseReturnType<string | null, string | null>>
    length(): Promise<number>
}

export class ClientStorage implements ClientStorageInterface {
    private readonly storage: EncryptStorage
    readonly type: ClientStorageType
    readonly options: EncryptStorageOptions

    private constructor(type: ClientStorageType, options?: EncryptStorageOptions) {
        this.type = type
        this.options = { ...options, storageType: this.type, doNotEncryptValues: true } || {
            prefix: `@${this.type.replace(/Storage$/, '')}`,
            storageType: this.type,
            doNotEncryptValues: true
        }
        this.storage = new EncryptStorage('not-so-secret-key-since-no-encryption-happens-at-this-stage', this.options)
    }

    async getItem(key: string): Promise<SafeParseReturnType<string, string>> {
        const schema = z.string()
        return schema.safeParse(this.storage.getItem(key, true))
    }

    async getMultipleItems<T extends Record<string, string | undefined>>(keys: string[]): Promise<SafeParseReturnType<Record<string, string | undefined>, Record<string, string | undefined>>> {
        const schema = z.record(z.string().min(1), z.string().optional())
        return schema.safeParse(this.storage.getMultipleItems(keys, true) as T)
    }

    async setItem(key: string, value: string): Promise<void> {
        const schema = z.string()
        const _value = schema.parse(value)
        return this.storage.setItem(key, _value, true)
    }

    async setMultipleItems<T extends [string, string][]>(items: T): Promise<void> {
        const schema = z.array(z.tuple([z.string(), z.string()]))
        const _items = schema.parse(items)
        return this.storage.setMultipleItems(_items, true)
    }

    async removeItem(key: string): Promise<void> {
        return this.storage.removeItem(key)
    }

    async removeMultipleItems(keys: string[]): Promise<void> {
        return this.storage.removeMultipleItems(keys)
    }

    async getItemFromPattern(pattern: string, options?: GetFromPatternOptions): Promise<SafeParseReturnType<string, string>> {
        const schema = z.string()
        return schema.safeParse(this.storage.getItemFromPattern(pattern, { ...options, doNotDecrypt: true }))
    }

    async removeItemFromPattern(pattern: string, options?: RemoveFromPatternOptions): Promise<void> {
        return this.storage.removeItemFromPattern(pattern, options)
    }

    async key(index: number): Promise<SafeParseReturnType<string | null, string | null>> {
        const schema = z.string().nullable()
        return schema.safeParse(this.storage.key(index))
    }

    async length(): Promise<number> {
        return this.storage.length
    }

    async clear(): Promise<void> {
        return this.storage.clear()
    }

    static async createSessionStorage(options?: EncryptStorageOptions): Promise<SessionClientStorage> {
        return await ClientStorage.create(ClientStorageTypes.SessionStorage, options) as SessionClientStorage
    }

    static async createLocalStorage(options?: EncryptStorageOptions): Promise<LocalClientStorage> {
        return await ClientStorage.create(ClientStorageTypes.LocalStorage, options) as LocalClientStorage
    }

    private static async create(type: ClientStorageType, options?: EncryptStorageOptions): Promise<ClientStorage> {
        await ClientStorage.validate(type)
        return new ClientStorage(type, options)
    }

    private static async validate(type: ClientStorageType): Promise<boolean> {
        if (!Object.values(ClientStorageTypes).includes(type)) {
            throw new Error(`validate: Invalid storage type: ${type}`)
        }

        return true
    }
}

export async function createClientSessionStorage(options?: EncryptStorageOptions): Promise<SessionClientStorage> {
    return await ClientStorage.createSessionStorage(options)
}

export async function createClientLocalStorage(options?: EncryptStorageOptions): Promise<LocalClientStorage> {
    return await ClientStorage.createLocalStorage(options)
}