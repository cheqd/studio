<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { applyAction, enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';

	let isLoading = false;
	const handleSigninWithLogto: SubmitFunction = () => {
		isLoading = true;

		return async ({ result, update }) => {
			switch (result.type) {
				case 'success':
					window.open(result.data?.location, '_self');
					break;
				case 'failure':
					// handle error here
					await applyAction(result);
					await update();
					break;
				case 'error':
					// handle server side error here
					await update();
					await applyAction(result);
					break;
				default:
					await update();
			}
			isLoading = false;
		};
	};
</script>

<div class="mt-12 flex h-full w-full flex-col items-center justify-center ">
	<form
		method="POST"
		action="/?/signinWithLogto"
		use:enhance={handleSigninWithLogto}
		class="flex h-96 w-1/2 items-center justify-center rounded-3xl bg-primary-800"
	>
		<Button loading={isLoading} styles="w-1/3 h-10">Sign in</Button>
	</form>
</div>
