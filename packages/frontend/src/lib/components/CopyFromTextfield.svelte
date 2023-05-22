<script lang="ts">
	import CopyIcon from '$icons/CopyIcon.svelte';
	import IconButton from './IconButton.svelte';
	import Cross from '$icons/Cross.svelte';

	export let id = '';
	export let name = '';
	export let label = '';
	export let value = '';
	export let hasBeenCopied = false;
	export let showCloseIcon = true;

	const handleCopy = () => {
		// highlight the text
		(document.getElementById(id ?? name) as HTMLInputElement).select();

		// copy the text
		navigator.clipboard.writeText(value);

		// track copy
		hasBeenCopied = true;

		// reset copy
		setTimeout(() => {
			hasBeenCopied = false;
		}, 2000);
	};

	export let handleModal: () => void;
</script>

<div class="flex w-full items-center justify-center gap-4">
	<div class="flex w-full flex-col items-start justify-center gap-3 py-2">
		<div class="flex w-full items-center justify-between">
			<span
				class="inline-block bg-gradient-to-r from-secondary-900 via-secondary-800 to-secondary-700 bg-clip-text text-2xl text-transparent"
			>
				{label}
			</span>
			{#if showCloseIcon}
				<IconButton styles="self-end" on:click={handleModal}>
					<Cross />
				</IconButton>
			{/if}
		</div>
		<div class="relative flex w-full items-center justify-center">
			<input
				class="{hasBeenCopied
					? 'pr-20'
					: 'pr-9'} focus:shadow-outline h-12 w-5/6 min-w-full appearance-none truncate rounded border border-gray-600 bg-gray-800 px-3 py-2 text-center leading-tight text-gray-200 shadow focus:outline-none"
				id={id ?? name}
				bind:value
				{name}
				type="text"
				readonly
			/>

			<button on:click={handleCopy} class="absolute right-0 top-0 z-30 p-3 text-white">
				{#if hasBeenCopied}
					Copied!
				{:else}
					<CopyIcon />
				{/if}
			</button>
		</div>
	</div>
</div>
