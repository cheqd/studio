import { Router } from 'itty-router'
import {  } from '../controllers/credentials'

const router = Router({ base: '/api/credentials' })

router.all(
    '/',
    () => new Response( JSON.stringify( { ping: 'pong' } ) )
)

router.post(
    '/issue',

)

export default router