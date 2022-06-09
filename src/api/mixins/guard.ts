import { VC_AUTH0_GUARD_URI } from '../constants'
import { Credentials } from '../controllers/credentials'

export class GuardedCredentials {
    guard = async (request: Request): Promise<boolean> => {
        return (await fetch(
            VC_AUTH0_GUARD_URI,
            {
                headers: { 'Authorization': request.headers.get('Authorization') }
            }
        )).json()['authenticated']
    }
}

export interface GuardedCredentials extends Credentials {
    guard: (request: Request) => Promise<boolean>
}
