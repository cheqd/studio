import { Router } from 'itty-router'
import { LocalStore } from '../controllers/store'

const router = Router({ base: '/store' })

router.post(
	'/',
	async (request: Request) => {
		const _body: Record<any,any> = await request.json()
		return LocalStore.instance.setItem(_body.data)
	}
)

router.get(
	'/:id',
	async ({params}) => {
		return LocalStore.instance.getItem(params!.id)
	}
)

export default router
