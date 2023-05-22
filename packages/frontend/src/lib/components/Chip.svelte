<script lang="ts">
	import Cross from '$lib/icons/Cross.svelte';
	import { twMerge } from 'tailwind-merge';
	let id = 'chip';
	let label: string;
	let styles: string = '';

	let showCloseIcon = true;
	export { id, label, showCloseIcon, styles };
</script>

<button
	on:click
	id={id.toString()}
	class={twMerge(
		`${
			showCloseIcon ? 'p-1' : 'px-2 py-1'
		} flex items-center justify-between  rounded-2xl bg-primary-700 text-white`,
		styles
	)}
>
	<div class="flex w-full items-center space-x-2">
		<slot />
		<span class="truncate text-sm">{label}</span>
	</div>
	{#if showCloseIcon}
		<Cross mini />
	{/if}
</button>
