import router from './router'

export const handleRequest = async ( request: Request ): Promise<Response> => {
    return await router.handle( request )
}