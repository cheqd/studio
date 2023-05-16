<script lang="ts">
	import { Disclosure as Disc, DisclosureButton, DisclosurePanel, Transition } from '@rgossiaux/svelte-headlessui';
	import ChevronDown from '$icons/ChevronDown.svelte';
	import TooltipIcon from '$icons/TooltipIcon.svelte';

	export let label = '';
	export let showPanel = false;
	export let showTooltipIcon = true;
	export let defaultOpen = false;
</script>

<Disc class="flex w-full flex-col gap-2" let:open {defaultOpen}>
	<DisclosureButton class="flex w-full justify-between gap-1 py-2 ">
		<div class="flex items-center justify-center gap-1">
			{label}
			{#if showTooltipIcon}
				<TooltipIcon mini={true} styles="text-gray-400" />
			{/if}
		</div>
		<ChevronDown styles={open && showPanel ? 'rotate-90' : ''} />
	</DisclosureButton>
	{#if open && showPanel}
		<Transition
			enter="transition duration-100 ease-out"
			enterFrom="transform scale-95 opacity-0"
			enterTo="transform scale-100 opacity-100"
			leave="transition duration-75 ease-out"
			leaveFrom="transform scale-100 opacity-100"
			leaveTo="transform scale-95 opacity-0"
		>
			<DisclosurePanel static as="div" class="text-gray-500">
				<slot />
			</DisclosurePanel>
		</Transition>
	{/if}
</Disc>
