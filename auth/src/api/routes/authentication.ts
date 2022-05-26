import { Router } from 'itty-router'
import { CryptoBox } from '../controllers/crypto_box'
import { handleAuthRequest, twitter_auth, callback_twitter_auth } from '../controllers/authentication'

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
    '/api/authentication/twitter',
    async (request: Request): Promise<Response> => {
      return await twitter_auth(request)
    }
  )
  .get(
    '/api/authentication/twitter/callback',
    async (request: Request): Promise<Response> => {
      return await callback_twitter_auth(request)
    }
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