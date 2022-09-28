import { HEADERS, VC_AUTH0_URI } from '../constants'
import { Credentials } from '../controllers/credentials'
import { GenericAuthResponse } from '../types'

export class GuardedCredentials {
    guard = async (request: Request): Promise<GenericAuthResponse> => {
        const { claim, provider, subjectId } = await request.json() as {claim: string, provider: string, subjectId: string} 

        const validation = await fetch(
            VC_AUTH0_URI,
            {
                method: 'POST',
                body: JSON.stringify(
                    {
                        claim,
                        provider
                    }
                ),
                headers: HEADERS.json
            }
        ).then(
            res => res.json()
        ).catch(error => ({ authenticated: false, user: null }))

        return {...validation as GenericAuthResponse, subjectId}
    }
}

export interface GuardedCredentials extends Credentials {
    guard: (request: Request) => Promise<GenericAuthResponse>
}
