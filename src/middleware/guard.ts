import { HEADERS } from '../types/constants'
import { Credentials } from '../services/credentials'
import { GenericAuthResponse } from '../types/types'
import { Request } from 'express'

require('dotenv').config()

export class GuardedCredentials {
	guard = async (request: Request): Promise<GenericAuthResponse> => {
		const { claim, subjectId, provider } = request.body as { claim: string, subjectId: string, provider: string }

		try {
			const resp = await fetch(
				process.env.AUTH0_SERVICE_ENDPOINT,
				{
					method: 'POST',
					body: JSON.stringify({ claim, provider: provider.toLowerCase() }),
					headers: HEADERS.json
				}
			)
			const validation = await resp.json()
			return { ...validation as GenericAuthResponse, subjectId, provider }
		} catch (err) {
			return { authenticated: false, user: null, error: err, provider } as GenericAuthResponse
		}

	}
}

export interface GuardedCredentials extends Credentials {
	guard: (request: Request) => Promise<GenericAuthResponse>
}
