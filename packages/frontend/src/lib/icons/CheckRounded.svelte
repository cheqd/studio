<script lang="ts">
	export let styles = '';
	import { twMerge } from 'tailwind-merge';
	export let mini = false;
</script>

{#if mini}
	<svg viewBox="0 0 20 20" fill="currentColor" class={twMerge('h-5 w-5', styles)}>
		<path
			fill-rule="evenodd"
			d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
			clip-rule="evenodd"
		/>
	</svg>
{:else}
	<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class={twMerge('h-6 w-6', styles)}>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
		/>
	</svg>
{/if}
