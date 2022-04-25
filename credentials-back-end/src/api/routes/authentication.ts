import { Router } from 'itty-router'
import { handleAuthRequest } from '../controllers/authentication'

const router = Router({ base: '/api/authentication' })

router
  .all(
    '/',
    () => new Response( JSON.stringify( { ping: 'pong' } ) )
  )
  .post(
    '/exchangeWalletToken',
    handleAuthRequest
  )

export default router