import { Router } from 'itty-router'
import auth_router from './api/routes/authentication'
import credentials_router from './api/routes/credentials'
import error_handler from './error_handler'

const router = Router({ base: '/api' })

router
    .all( '/authentication/*', auth_router.handle)
    .all( '/credentials/*', credentials_router.handle)
    .all( '*', error_handler )

export default router