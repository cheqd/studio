import { CORS_HEADERS, HEADERS } from "../constants";

export class CryptoBox {
    storage: KVNamespace

    constructor() {
        this.storage = CREDENTIALS
    }

    async handleGetCryptoBox(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const accountId = url.pathname.split('/').pop() || "";
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

    async putToKVStore(request: Request) {
        const body = await this.readJSONBody(request)
        if (body === undefined) {
            return new Response(
                "Post was rejected because wrong ContentType. JSON is expected",
                {
                    headers: {
                        ...CORS_HEADERS,
                        ...HEADERS.text
                    }
                }
                )
        }
        console.log("Put: sccountId: ", body["accountID"])
        await this.storage.put(body["accountID"], JSON.stringify(body["cryptoBox"]))
        return new Response("Value has been stored")
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