import { VC_AUTH0_GUARD_URI } from '../constants'
import { Credentials } from '../controllers/credentials'
import { GenericAuthResponse } from '../types'

export class GuardedCredentials {
    guard = async (request: Request): Promise<GenericAuthResponse> => {
        return (await fetch(
            VC_AUTH0_GUARD_URI,
            {
                headers: { 'Authorization': request.headers.get('Authorization') }
            }
        )).json()
    }
}

export interface GuardedCredentials extends Credentials {
    guard: (request: Request) => Promise<GenericAuthResponse>
}
