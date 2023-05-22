<script lang="ts">
	import { RadioGroup as RG, RadioGroupOption, RadioGroupLabel } from '@rgossiaux/svelte-headlessui';
	import RadioInput from './RadioInput.svelte';
	import type { CredentialClaimStatusType } from '$shared/types';

	type Options = {
		value: string;
		label: string;
	};

	const handleRadioValue = (e: CustomEvent) => {
		setValue(e.detail);
	};

	let value = '';
	let setValue: (s: CredentialClaimStatusType) => void;
	let options: Options[];
	let testid = '';
	export { value, setValue, options, testid };
</script>

<RG {value} on:change={handleRadioValue}>
	<div class="flex flex-col gap-2" data-testid={testid}>
		{#each options as o (o.label)}
			<RadioGroupOption let:checked value={o.value}>
				<div class="flex items-center gap-4">
					<RadioInput {checked} />
					<RadioGroupLabel class="text-sm text-white">{o.label}</RadioGroupLabel>
				</div>
			</RadioGroupOption>
		{/each}
	</div>
</RG>
