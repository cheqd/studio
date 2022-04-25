import { handleAuthToken } from "./authentication";
import { CORS_HEADERS, HEADERS } from "../constants";


export class CryptoBox {
    storage: KVNamespace

    constructor() {
        this.storage = CREDENTIALS
    }

    async handleGetCryptoBox(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const accountId = url.pathname.split('/').pop() || "";

        // const token = url.searchParams.get('authToken'
        const token = request.headers.get("Authorization")
        if (token === null) {
            return new Response("Token is not placed in headers", {status: 500})
        }

        const isAllowed = await handleAuthToken(token)
        if (!isAllowed) {
            return new Response("Auth token is not valid.", {status: 500})
        }

        return await this.GetFromKVStore(accountId)
    }
    
    async GetFromKVStore(accountId: string): Promise<Response> {
    
        const value = await this.storage.get(accountId)
        if (value === null) {
            return new Response(
                "Value not found",
                {
                    status: 404,
                    headers: {
                        ...CORS_HEADERS,
                        ...HEADERS.text
                    }
                }
                )
        }
        const parsed_value = JSON.parse(value)
        const resp_value = {
            cryptoBox: parsed_value
        }
        return new Response(
            JSON.stringify(resp_value),{
                headers: {
                    ...CORS_HEADERS,
                    'content-type': 'application/json;charset=UTF-8',
            },
        })
    }

    async authenticated(token: string): Promise<boolean> {
        return await handleAuthToken(token)
    }

    async putToKVStore(request: Request) {
        const cryptoJson = await this.readJSONBody(request)
        if (cryptoJson === undefined) {
            return new Response(
                "Post was rejected because wrong ContentType. JSON is expected",
                {
                    status: 500,
                    headers: {
                        ...CORS_HEADERS,
                        ...HEADERS.text
                    }
                }
            )

        }

        const isAllowed = await this.authenticated(cryptoJson["Authorization"]);
        if (!isAllowed) {
            return new Response("Auth token is not valid.", {status: 500})
        }

        await this.storage.put(cryptoJson["accountID"], JSON.stringify(cryptoJson["cryptoBox"]))
        return new Response("Value has been stored", {status: 500})
    }
    
    async readJSONBody(request: Request): Promise<any>{
        const { headers } = request;
        const contentType = headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
            return await request.json();
        } else {
            return undefined
        }
    }
    
    async handlePostKVStore(request: Request): Promise<Response>{
        return await this.putToKVStore(request)
    }
}