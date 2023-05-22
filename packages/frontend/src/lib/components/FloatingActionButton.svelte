<script lang="ts">
	import AdjustmentVertical from '../icons/AdjustmentVertical.svelte';
</script>

<button
	on:click
	class="z-90 fixed bottom-10 right-8 flex h-10 w-10 items-center justify-center rounded-md border border-blue-400 bg-primary-900 text-4xl text-white drop-shadow-lg duration-300 md:h-12 md:w-12 lg:hidden"
>
	<AdjustmentVertical styles={'text-blue-400'} />
</button>
