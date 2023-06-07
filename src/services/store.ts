import NodeCache from 'node-cache'

export class LocalStore {
    private cache: NodeCache

    public static instance = new LocalStore()

    constructor() {
        this.cache = new NodeCache()
    }

    setItem(data: string) : string {
        const key = Math.random().toString(36).slice(2)
        this.cache.set(key, data, 300)
        return key
    }

    getItem(path: string) {
        const data = this.cache.get(path) as string | undefined
        return data     
    }
}