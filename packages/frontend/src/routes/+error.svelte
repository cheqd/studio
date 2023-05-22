<script lang="ts">
	import { page } from '$app/stores';
	let showDetailed = false;

	function renderErrorMsg() {
		console.log('error message: ', $page);
		if (typeof $page.error?.message === 'object') {
			try {
				const errMsg = JSON.parse($page.error?.message);
				return errMsg?.error;
			} catch {
				return $page.error?.message;
			}
		}

		return $page.error?.message;
	}
</script>

<div class="flex h-full w-full flex-col items-center justify-center gap-4 p-8 ">
	{#if $page.error?.status === 401}
		<img alt="" class="h-4/5 w-4/5 lg:h-2/5 lg:w-2/5" src="/access-denied.svg" />
	{:else if $page.error?.status === 404}
		<img alt="" class="h-4/5 w-4/5 lg:h-2/5 lg:w-2/5" src="/404-not-found.svg" />
	{:else}
		<img alt="" class="h-4/5 w-4/5 lg:h-2/5 lg:w-2/5" src="/default-error.svg" />
	{/if}

	<div>
		<p class="text-lg tracking-wide text-gray-200">Error: {renderErrorMsg()}</p>
	</div>
	<div>
		<button
			on:click={() => {
				showDetailed = !showDetailed;
			}}
			class="rounded-lg border-2 border-gray-200 px-4 py-2 text-gray-200"
		>
			View detailed error
		</button>
	</div>
	{#if showDetailed}
		<div class="rounded-lg bg-primary-800  p-8 text-gray-200">
			{JSON.stringify($page.error, null, 2)}
		</div>
	{/if}
</div>
