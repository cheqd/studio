import NodeCache from 'node-cache'
import { HEADERS } from '../constants'

export class LocalStore {
    private cache: NodeCache

    public static instance = new LocalStore()

    constructor() {
        this.cache = new NodeCache(); 
    }

    setItem(data: string) {
        const key = Math.random().toString(36).slice(2)
        this.cache.set(key, data, 300)

        return new Response(
            JSON.stringify({
                path: key 
            }),
            {
                status: 200,
				headers: {
					...HEADERS.json,
					"access-control-allow-origin": "*"
				}
            }
        )
    }

    getItem(path: string) {
        const data = this.cache.get(path) as string | undefined
        if(!data) {
            return new Response(
                'Not Found',
                {
                    status: 400,
                    headers: HEADERS.json
                }
            )
        }

        return new Response(
            data,
            {
                status: 200,
				headers: {
					...HEADERS.json,
					"access-control-allow-origin": "*"
				}
            }
        )        
    }
}