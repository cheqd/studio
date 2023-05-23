<script lang="ts">
	export let name = '';
	export let label = '';
	export let id: string | null = null;
	export let placeholder = '';
	export let value = '';
	export let type = 'text' || 'password';

	let show: boolean = false;

	const handleShow = () => {
		if (type === 'password') type = 'text';
		else type = 'password';
		show = !show;
	};

	$: reactiveType = show ? 'text' : type;
</script>

{#if type === 'password'}
	<div class="flex w-full flex-col items-start justify-start py-2">
		<label class="mb-1 block text-sm font-bold text-gray-100" for={id}>
			{label}
		</label>
		<div class="relative w-full">
			<div class="absolute inset-y-0 right-0 flex items-center px-2">
				<input class="hidden" id="toggle" type="checkbox">
				<label
					class="bg-gray-300 hover:bg-gray-400 rounded px-2 py-1 text-sm text-gray-600 font-mono cursor-pointer"
					for="toggle"
					on:click={handleShow}
					on:keypress
				>
					{show ? 'Hide' : 'Show'}
				</label>
			</div>
			<input
				class="appearance-none focus:shadow-outline w-full min-w-full rounded border py-2 px-3 leading-tight text-gray-700 shadow focus:outline-none"
				id={id ?? name}
				bind:value
				on:change
				{placeholder}
				{name}
				type="password"
			/>
		</div>
	</div>
{:else if type === 'hidden'}
	<div class="flex w-full flex-col items-start justify-start py-2">
		<label class="mb-1 block text-sm font-bold text-gray-100" for={id}>
			{label}
		</label>
		<input
			class="focus:shadow-outline w-full min-w-full appearance-none rounded border py-2 px-3 leading-tight text-gray-700 shadow focus:outline-none"
			id={id ?? name}
			bind:value
			on:change
			{placeholder}
			{name}
			type="hidden"
		/>
	</div>
{:else}
	<div class="flex w-full flex-col items-start justify-start py-2">
		<label class="mb-1 block text-sm font-bold text-gray-100" for={id}>
			{label}
		</label>
		<div class="relative w-full">
			{#if type === 'text' && show}
			<div class="absolute inset-y-0 right-0 flex items-center px-2">
				<input class="hidden" id="toggle" type="checkbox">
				<label
					class="bg-gray-300 hover:bg-gray-400 rounded px-2 py-1 text-sm text-gray-600 font-mono cursor-pointer"
					for="toggle"
					on:click={handleShow}
					on:keypress
				>
					{show ? 'Hide' : 'Show'}
				</label>
			</div>
			{/if}
			<input
				class="appearance-none focus:shadow-outline w-full min-w-full appearance-none rounded border py-2 px-3 leading-tight text-gray-700 shadow focus:outline-none"
				id={id ?? name}
				bind:value
				on:change
				{placeholder}
				{name}
			/>
		</div>
	</div>
{/if}
