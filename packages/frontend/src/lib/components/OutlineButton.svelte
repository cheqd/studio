<script lang="ts">
	import Loader from '$lib/icons/Loader.svelte';
	import { twMerge } from 'tailwind-merge';

	let disabled = false;
	let styles = '';
	let innerStyles = '';
	let loading = false;
	let formaction: string | null = null;
	let loadingTitle = 'Loading';

	export { disabled, styles, innerStyles, loading, loadingTitle, formaction };

	const baseClasses = () => {
		let base = ` font-semibold rounded-xl flex justify-center items-center bg-gradient-to-r from-secondary-900 via-secondary-800
            to-secondary-700 p-[1px]`;

		if (styles !== '') {
			base = twMerge(base, styles);
		}

		return base;
	};

	const wrapInnerClasses = () => {
		let base = `whitespace-nowrap text-white flex gap-2 text-sm lg:px-4 justify-center items-center h-10
        rounded-xl transition delay-75 duration-300 ease-out`;

		if (innerStyles !== '') {
			base = twMerge(base, innerStyles);
		}
		if (disabled) {
			base = twMerge(base, 'disabled cursor-default');
		}

		return base;
	};
</script>

<div class={baseClasses()}>
	<button on:click {disabled} {formaction} class={wrapInnerClasses()}>
		{#if loading}
			<Loader />
			{loadingTitle}
		{:else}
			<slot />
		{/if}
	</button>
</div>
