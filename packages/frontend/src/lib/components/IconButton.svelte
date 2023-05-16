<script lang="ts">
	let disabled = false;
	let styles = '';
	let testid = '';

	export { styles, disabled, testid };
</script>

<button on:click {disabled} class="{styles} rounded-3xl bg-gradient-to-l text-slate-50" data-testid={testid}>
	<slot />
</button>
