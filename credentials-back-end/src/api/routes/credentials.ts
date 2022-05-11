import { Router } from 'itty-router'
import { Credentials } from '../controllers/credentials'
import { CryptoBox } from '../controllers/crypto_box'
import { CredentialRequest, W3CVerifiableCredential } from '../types'

const router = Router({ base: '/api/credentials' })

router.all(
    '/',
    () => new Response( JSON.stringify( { ping: 'pong' } ) )
)

router.all(
    '/issue/*',
    async (request: Request) => {
        return await ( new Credentials() ).issue_credentials(request)
    }
)

router.post(
    '/verify',
    async (request: Request) => {
        const _body: Record<any, any> = await request.json()
        const _credential = _body[ 'credential' ]
        //@ts-ignore
        const credential_request: CredentialRequest = { ...request as Request, credential: _credential as W3CVerifiableCredential }
        console.warn(credential_request)
        return await ( new Credentials() ).verify_credentials(credential_request)
    }
)

router.get(
    '/cryptoBox/*',
    async (request: Request) => {
        return await (new CryptoBox() ).handleGetCryptoBox(request)
    }
)

router.post(
    '/cryptoBox/*',
    async (request: Request) => {
        return await (new CryptoBox() ).handlePostKVStore(request)
    }
)

export default router

