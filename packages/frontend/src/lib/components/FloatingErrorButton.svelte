<script lang="ts">
    import Refresh from "$icons/Refresh.svelte";

    export let text: string;
    export let styles: string;
    export let refreshStyles: string;
    export let retryCallback: (<T>(...args: any[]) => Promise<T>) | (() => Promise<void>) | null;
</script>

<button
on:click={retryCallback}
	class="{styles}"
>
    {#if text}
        <span class="text-xs pr-4">{text}</span>
    {/if}
	<Refresh
        styles="{refreshStyles}"
    />
</button>
