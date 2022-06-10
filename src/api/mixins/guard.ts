import { HEADERS, VC_AUTH0_GUARD_URI } from '../constants'
import { Credentials } from '../controllers/credentials'
import { GenericAuthResponse } from '../types'

export class GuardedCredentials {
    guard = async (request: Request): Promise<GenericAuthResponse> => {
        const { claim, subjectId } = await request.json()

        return await fetch(
            'https://auth0-proxy-staging.cheqd.net/api/auth0/twitter/validate',
            {
                method: 'POST',
                body: JSON.stringify(
                    {
                        claim: claim
                    }
                ),
                headers: HEADERS.json
            }
        ).then(
            res => ({...res.json(), subjectId: subjectId})
        ).catch(error => new Response(
            JSON.stringify(
                {error: 'Unauthenticated.'}
            ),
            {
                headers: HEADERS.json,
                status: 401
            }
        ))
    }
}

export interface GuardedCredentials extends Credentials {
    guard: (request: Request) => Promise<GenericAuthResponse>
}
