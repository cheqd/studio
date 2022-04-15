import router from './router'

const handleRequest = async ( request: Request ): Promise<Response> => {
    return await router.handle( request )
}

export default handleRequest