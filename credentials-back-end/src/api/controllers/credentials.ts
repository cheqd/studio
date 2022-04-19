
class Credentials {
    constructor() {
        return ''
    }
}

export default  {
    issue_credentials: async (request: Request): Promise<Response> => {
        return new Response('h3h3')
    }
}