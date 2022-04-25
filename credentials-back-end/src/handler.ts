import router from './router'

export const handleRequest = async ( request: Request ): Promise<Response> => {
    let response = await router.handle( request )
    
    return response
}