import { Router } from 'itty-router'
import { Credentials } from '../controllers/credentials'

const router = Router({ base: '/api/credentials' })

router.all(
    '/',
    () => new Response( JSON.stringify( { ping: 'pong' } ) )
)

router.all(
    '/issue',
    async (request: Request) => {
        return await ( new Credentials() ).issue_credentials(request)
    }
)

export default router