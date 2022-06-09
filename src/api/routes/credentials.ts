import { Router } from 'itty-router'
import { Credentials } from '../controllers/credentials'
import { CredentialRequest, W3CVerifiableCredential } from '../types'
import { GuardedCredentials } from '../mixins/guard'
import { applyMixins } from '../mixins/_'
import { HEADERS } from '../constants'

const router = Router({ base: '/api/credentials' })

router.all(
    '/',
    () => new Response( JSON.stringify( { ping: 'pong' } ) )
)

router.all(
    '/issue/*',
    async (request: Request) => {
        applyMixins(GuardedCredentials, [Credentials])

        const credentials = new GuardedCredentials()

        const auth = await credentials.guard(request)

        if( !( auth.authenticated ) ) 
            return new Response(
                JSON.stringify({error: 'Unauthenticated.'}),
                {
                    status: 401,
                    headers: HEADERS.json
                }
            )

        return await credentials.issue_credentials(request, user)
    }
)

router.post(
    '/verify',
    async (request: Request) => {
        const _body: Record<any, any> = await request.json()
        const _credential = _body[ 'credential' ]
        const credential_request = { ...request as Request, credential: _credential as W3CVerifiableCredential } as CredentialRequest
        return await ( new Credentials() ).verify_credentials(credential_request)
    }
)

export default router

