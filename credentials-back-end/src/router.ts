import { Router } from 'itty-router'
import auth_router from './api/routes/authentication'
import credentials_router from './api/routes/credentials'

const router = Router({ base: '/api' })

router
    .all( '/authentication/*', auth_router.handle)
    .all( '/credentials/*', credentials_router.handle)
    .all( '*',  )

export default router