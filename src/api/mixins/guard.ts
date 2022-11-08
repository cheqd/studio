import { HEADERS } from '../constants'
import { Credentials } from '../controllers/credentials'
import { GenericAuthResponse } from '../types'

export class GuardedCredentials {
	guard = async (request: Request): Promise<GenericAuthResponse> => {
		const { claim, subjectId } = await request.json() as { claim: string, subjectId: string }

		try {
			const resp = await fetch(
				AUTH0_SERVICE_ENDPOINT,
				{
					method: 'POST',
					body: JSON.stringify(
						{
							claim,
							provider: 'twitter'
						}
					),
					headers: HEADERS.json
				}
			)
			const validation = await resp.json()
			return { ...validation as GenericAuthResponse, subjectId }
		} catch (err) {
			return { authenticated: false, user: null, error: err } as GenericAuthResponse
		}

	}
}

export interface GuardedCredentials extends Credentials {
	guard: (request: Request) => Promise<GenericAuthResponse>
}
