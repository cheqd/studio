import { CORS_HEADERS, HEADERS } from './api/constants'
import router from './router'

export const handleRequest = async ( request: Request ): Promise<Response> => {
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