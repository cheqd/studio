<script lang="ts">
	let id = 'checkbox';
	let checked = false;
	let styles = '';
	let testid = '';

	export { checked, styles, testid };
</script>

<label class="cursor-pointer">
	<input {id} type="checkbox" on:change bind:checked class={styles + ' '} data-testid={testid} />
</label>
