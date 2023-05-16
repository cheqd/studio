<script lang="ts">
    import Loader from "$icons/Loader.svelte";

    export let text: string;
    export let styles: string;
    export let loaderStyles: string;
</script>

<button
	on:click
	class="{styles}"
    disabled={true}
>
    {#if text}
        <span class="text-xs pr-4">{text}</span>
    {/if}
	<Loader
        styles="{loaderStyles}"
    />
</button>
