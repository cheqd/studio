<script lang="ts">
	import { twMerge } from 'tailwind-merge';
	export let styles = '';
	export let mini = false;
</script>

{#if mini}
	<svg class={twMerge('h-5 w-5', styles)} viewBox="0 0 20 20" fill="currentColor">
		<path
			d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
		/>
	</svg>
{:else}
	<svg fill="none" viewBox="0 0 24 24" stroke-width={1.5} stroke="currentColor" class={twMerge('h-6 w-6', styles)}>
		<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
	</svg>
{/if}
