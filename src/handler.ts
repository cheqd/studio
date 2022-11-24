import { ServerResponse } from 'http';
import { CORS_HEADERS, HEADERS } from './api/constants'
import router from './router'

export const handleRequest = async ( request: Request, response: ServerResponse ): Promise<void> => {
    // Handle CORS preflight request
    if (
        request.headers.get('Origin') !== null &&
        request.headers.get('Access-Control-Request-Method') !== null
    ) {
        const origin = '*';
        const methods = 'GET, POST, HEAD, OPTIONS';
        const headers = 'referer, origin, content-type, authorization';

        const corsHeaders: Record<string, string> = {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': methods,
            'Access-Control-Allow-Headers': headers,
        }

        // Handle CORS pre-flight request.
        response.statusCode=204
        for (var name in corsHeaders) {
            response.setHeader(name, corsHeaders[name])
        }
        return
    }

    return await router
        .handle( request )
        .then( async (resp: Response) => {
            for( const header of CORS_HEADERS ){
                response.setHeader(
                    Object.keys( header )[0],
                    String( Object.values( header )[0] ),
                )
            }
            response.statusCode=resp.status

            resp.headers.forEach((value, key)=>{
               response.setHeader(key, value)
            })
            response.write(await resp.text())
            return
        })
        .catch((error: Error) => {
            response.setHeader('Content-Type', HEADERS.json['Content-Type'])
            response.statusCode=500
            response.write(JSON.stringify( { error: 'Unhandled exception occurred.' }))
            return
        })
}