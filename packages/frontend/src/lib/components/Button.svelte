<script lang="ts">
	import Loader from '$lib/icons/Loader.svelte';
	import { twMerge } from 'tailwind-merge';
	let disabled = false;
	let styles = '';
	let loading = false;
	let formaction: string | null = null;

	let loadingTitle = 'Loading';
	export { disabled, styles, loading, loadingTitle, formaction };

	const baseClasses = () => {
		let base = ` font-semibold whitespace-nowrap text-white flex gap-2 text-sm tracking-wider px-2 lg:px-4 justify-center items-center
		rounded-3xl h-10 bg-gradient-to-r from-secondary-900 via-secondary-800 to-secondary-700`;
		if (disabled) {
			base = 'disabled cursor-default ' + base;
		}

		if (styles !== '') {
			base = twMerge(base, styles);
		}

		return base;
	};
</script>

<button on:click {disabled} class={baseClasses()} {formaction}>
	{#if loading}
		<Loader />
		{loadingTitle}
	{:else}
		<slot />
	{/if}
</button>
