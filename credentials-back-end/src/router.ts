import { Router } from 'itty-router'
import auth_router from './api/routes/authentication'
import credentials_router from './api/routes/credentials'
import error_handler from './error_handler'


const router = Router()

router
    .all( '/api/authentication/*', auth_router.handle)
    .all( '/api/credentials/*', credentials_router.handle)

router.all('*', error_handler)

export default router