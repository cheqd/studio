import { Router } from 'itty-router'

const router = Router({ base: '/api/authentication' })

router.all(
    '/',
    () => new Response( JSON.stringify( { ping: 'pong' } ) )
)

export default router