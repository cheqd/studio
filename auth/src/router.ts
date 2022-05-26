import { Router } from 'itty-router'
import auth_router from './api/routes/authentication'
import error_handler from './error_handler'


const router = Router()

router
    .all( '/api/authentication/*', auth_router.handle)

router.all('*', error_handler)

export default router