import { CORS_HEADERS, HEADERS } from './api/constants'
import router from './router'

export const handleRequest = async ( request: Request ): Promise<Response> => {
    // Handle CORS preflight request
    if (
        request.headers.get('Origin') !== null &&
        request.headers.get('Access-Control-Request-Method') !== null
    ) {
        const origin = '*';
        const methods = 'GET, POST, PATCH, DELETE';
        const headers = 'referer, origin, content-type, authorization';

        const corsHeaders = {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': methods,
            'Access-Control-Allow-Headers': headers,
        }

        // Handle CORS pre-flight request.
        return new Response(null, {
            status: 204,
            headers: corsHeaders
        })
    }

    return await router
        .handle( request )
        .then( (response: Response) => {
            for( const header of CORS_HEADERS ){
                response.headers.set(
                    Object.keys( header )[0],
                    String( Object.values( header )[0] ),
                )
            }

            return response
        })
        .catch((error: Error) => {
            return new Response( JSON.stringify( { error: 'Unhandled exception occured.' } ), { status: 500, headers: { ...HEADERS.json } } )
        })
}