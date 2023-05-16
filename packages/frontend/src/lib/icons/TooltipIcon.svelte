<script lang="ts">
	export let styles = '';
	export let mini = false;

	import { twMerge } from 'tailwind-merge';
</script>

{#if mini}
	<svg viewBox="0 0 20 20" fill="currentColor" class={twMerge('h-5 w-5', styles)}>
		<path
			fill-rule="evenodd"
			d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
			clip-rule="evenodd"
		/>
	</svg>
{:else}
	<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class={twMerge('h-6 w-6', styles)}>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
		/>
	</svg>
{/if}
