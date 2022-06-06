import { Router } from 'itty-router'
import { CryptoBox } from '../controllers/crypto_box'
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
  .get(
      '/cryptoBox/*',
      async (request: Request) => {
          return await (new CryptoBox() ).handleGetCryptoBox(request)
      }
  )
  .post(
      '/cryptoBox/*',
      async (request: Request) => {
          return await (new CryptoBox() ).handlePostKVStore(request)
      }
  )

export default router