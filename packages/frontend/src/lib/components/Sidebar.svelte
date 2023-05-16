<script lang="ts">
	import AdjustmentVertical from '$icons/AdjustmentVertical.svelte';
	import HorizontalRule from '$lib/components/HorizontalRule.svelte';
	import Disclosure from '$lib/components/Disclosure.svelte';
	import RadioGroup from '$lib/components/RadioGroup.svelte';
	import Cross from '$lib/icons/Cross.svelte';
	import type { CheckBoxButtonOption } from '$lib/client/types';
	import { filterByStore } from '$lib/stores/filteredCredentialsStore';
	import CheckBoxGroup from './CheckBoxGroup.svelte';
	import { CredentialFilterSchema } from '$shared/schema';
	import type { CredentialFilterType } from '$shared/types';

	let filterType: CredentialFilterType = CredentialFilterSchema.enum.ALL;

	const setFilterStatus = (s: CredentialFilterType) => {
		filterType = s;
		switch (s) {
			// NOTE: we're using different claimStatus types. One is used by the FE and the other by BE. Took me hours to figure this out.
			case CredentialFilterSchema.enum.CLAIM_PENDING: {
				filterByStore.update((prev) => ({
					...prev,
					filterType: CredentialFilterSchema.enum.CLAIM_PENDING,
				}));
				break;
			}
			case CredentialFilterSchema.enum.CLAIMED: {
				filterByStore.update((prev) => ({
					...prev,
					filterType: CredentialFilterSchema.enum.CLAIMED,
				}));
				break;
			}
			case CredentialFilterSchema.enum.ALL: {
				filterByStore.update((prev) => ({
					...prev,
					filterType: CredentialFilterSchema.enum.ALL,
				}));
				break;
			}
		}
	};
	let showSidebar: boolean;
	let handleSideBarToggle: () => void;

	let showClaimStatus = true;
	let showTypes = true;
	let showIssuer = true;
	let issuers: CheckBoxButtonOption[] = [];
	let credentialTypes: CheckBoxButtonOption[] = [];
	export { showSidebar, handleSideBarToggle, issuers, credentialTypes };
</script>

<div
	class="{showSidebar
		? 'scrollable-without-scrollbar mx-0 mt-0 h-screen overflow-y-auto rounded-none lg:mx-2 lg:my-4 lg:rounded-3xl'
		: ''} prose mx-2 my-4 flex flex-col gap-4 gap-y-4 rounded-3xl bg-primary-800 px-6 py-4 text-white"
>
	<div>
		<div class="{showSidebar ? 'space-x-3' : 'justify-between'} flex items-center lg:justify-between">
			<h3 class="m-0 p-0 text-lg text-white">Filter</h3>
			<AdjustmentVertical styles={'h-6 w-6 text-blue-400'} />
			{#if showSidebar}
				<div class="inline-flex w-11/12 justify-end">
					<button
						on:click={handleSideBarToggle}
						class="lg:hidden"
						data-testid="sidebar-mobile-cross-icon-button"
					>
						<Cross />
					</button>
				</div>
			{/if}
		</div>
		<p class="text-sm font-extralight">
			Use the filter to switch between your existing claimed credentials or credentials you are eligible for. You
			can also filter credential types.
		</p>
	</div>
	<HorizontalRule />
	<!-- Claim status -->
	<div
		on:keydown={() => {}}
		on:click={() => {
			showClaimStatus = true;
		}}
	>
		<div class="flex items-center justify-between">
			<Disclosure label="Claimed Status" showPanel={showClaimStatus} defaultOpen={true}>
				<RadioGroup
					value={filterType}
					setValue={setFilterStatus}
					options={[
						{
							label: 'All credentials',
							value: CredentialFilterSchema.enum.ALL,
						},
						{
							label: 'Claimed credentials',
							value: CredentialFilterSchema.enum.CLAIMED,
						},
						{
							label: 'Unclaimed credentials',
							value: CredentialFilterSchema.enum.CLAIM_PENDING,
						},
					]}
					testid="sidebar-claim-status-radio-group"
				/>
			</Disclosure>
		</div>
	</div>
	<HorizontalRule />
	<!-- Types -->
	<div
		on:keydown={() => {}}
		on:click={() => {
			showTypes = true;
		}}
	>
		<div class="flex items-center justify-between">
			<Disclosure label="Types" showPanel={showTypes} defaultOpen={true}>
				<CheckBoxGroup
					options={credentialTypes}
					testid="sidebar-cred-type-checkbox-group"
					type="CredentialType"
				/>
			</Disclosure>
		</div>
	</div>
	<HorizontalRule />
	<!-- Issuer -->
	<div
		on:keydown={() => {}}
		on:click={() => {
			showIssuer = true;
		}}
	>
		<div class="flex items-center justify-between">
			<Disclosure label="Issuer" showPanel={showIssuer} defaultOpen={true}>
				<CheckBoxGroup
					isScrollable={issuers.length > 10}
					options={issuers}
					testid="sidebar-issuers-checkbox-group"
					type="Issuer"
				/>
			</Disclosure>
		</div>
	</div>
	<HorizontalRule />
	<div class="flex w-full flex-col items-start justify-between gap-0">
		<span class="text-xs">Powered by</span>
		<div class="flex w-full items-center justify-start gap-2">
			<img alt="" class="h-14 w-14" src="/waltid-logo.svg" />
			<img alt="" class="h-14 w-14" src="/cheqd-logo.svg" />
		</div>
	</div>
</div>
