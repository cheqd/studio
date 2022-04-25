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

    // Handle request
    const response = await router.handle( request )

    // Inject CORS headers
    response.headers.set("Access-Control-Allow-Origin", "*")
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "referer, origin, content-type, authorization")

    return response
}
