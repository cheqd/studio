import { ErrorResponse } from './api/types'

const error_handler = ( error: ErrorResponse ): Response => { return new Response( error.message || 'Internal Server Error', { status: error.status || 500 } ) }

export default {
    error_handler: error_handler
}