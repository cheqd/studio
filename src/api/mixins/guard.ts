import { HEADERS } from '../constants'
import { Credentials } from '../controllers/credentials'
import { GenericAuthResponse } from '../types'

export class GuardedCredentials {
	guard = async (request: Request): Promise<GenericAuthResponse> => {
		const { claim, provider, subjectId } = await request.json() as { claim: string, provider: string, subjectId: string }

		console.log('method: guard - try with AUTH0_SERVICE_ENDPOINT')
		try {
			const resp = await fetch(
				AUTH0_SERVICE_ENDPOINT,
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
			)
			const validation = await resp.json()
			console.log('validation successful')
			return { ...validation as GenericAuthResponse, subjectId }
		} catch (err) {
			console.log('validation error: ', JSON.stringify(err))
			return { authenticated: false, user: null, error: err } as GenericAuthResponse
		}

	}
}

export interface GuardedCredentials extends Credentials {
	guard: (request: Request) => Promise<GenericAuthResponse>
}
