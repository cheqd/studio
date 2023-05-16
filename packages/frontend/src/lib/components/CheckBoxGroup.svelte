<script lang="ts">
	import type { CheckBoxButtonOption } from '$lib/client/types';
	import Achievement from '$lib/icons/Achievement.svelte';
	import Event from '$lib/icons/Event.svelte';
	import FilterCheqd from '$lib/icons/FilterCheqd.svelte';
	import FilterWaltid from '$lib/icons/FilterWaltid.svelte';
	import Reputation from '$lib/icons/Reputation.svelte';
	import Role from '$lib/icons/Role.svelte';
	import Social from '$lib/icons/Social.svelte';
	import { CredentialTypeSchema } from '$shared/schema';
	import CheckBoxInput from './Checkbox.svelte';
	import { filterByStore, issuerIdStore } from '$lib/stores/filteredCredentialsStore';

	import { onMount } from 'svelte';
	import TicketIcon from '$icons/TicketIcon.svelte';
	import BookOpenIcon from '$icons/BookOpenIcon.svelte';
	let options: CheckBoxButtonOption[];
	let isScrollable = false;
	let testid = '';

	let type: 'Issuer' | 'CredentialType' = 'CredentialType';

	onMount(() => {
		// set issuers store on load
		if (type === 'Issuer') {
			issuerIdStore.set(options.map((o) => o.value));
		}
	});

	const handleOnChange = (e: { target: ({ checked?: boolean } & EventTarget) | null }, o: CheckBoxButtonOption) => {
		if (e?.target?.checked) {
			o.checked = true;
		} else {
			o.checked = false;
		}

		filterByStore.update((prev) => ({
			...prev,
			issuer:
				type === 'Issuer'
					? options
							.filter((o) => o.checked)
							.map((v) => {
								// if (typeof v is typeof CredentialType) {
								// 	return;
								// }
								return v.value;
							})
					: prev.issuer,
			credentialType:
				type === 'CredentialType'
					? options
							.filter((o) => o.checked)
							.map((v) => {
								switch (v.value) {
									case CredentialTypeSchema.enum.Achievements: {
										return CredentialTypeSchema.enum.Achievements;
									}
									case CredentialTypeSchema.enum.Roles: {
										return CredentialTypeSchema.enum.Roles;
									}
									case CredentialTypeSchema.enum.Events: {
										return CredentialTypeSchema.enum.Events;
									}
									case CredentialTypeSchema.enum.Socials: {
										return CredentialTypeSchema.enum.Socials;
									}
									case CredentialTypeSchema.enum.Tickets: {
										return CredentialTypeSchema.enum.Tickets;
									}
									case CredentialTypeSchema.enum.Learn: {
										return CredentialTypeSchema.enum.Learn;
									}
									case CredentialTypeSchema.enum.Endorsement: {
										return CredentialTypeSchema.enum.Endorsement;
									}
									default: {
										return CredentialTypeSchema.enum.Socials;
									}
								}
							})
					: prev.credentialType,
		}));
	};
	export { isScrollable, options, testid, type };
</script>

<div>
	<div class={`flex flex-col justify-center gap-2  ${isScrollable ? '' : 'h-auto'}`} data-testid={testid}>
		{#each options as o (o.value)}
			<div class="flex cursor-pointer items-center gap-2">
				<CheckBoxInput
					checked={o.checked}
					on:change={(e) => {
						handleOnChange(e, o);
					}}
				/>

				<!-- Issuers -->
				{#if o.icon === 'FilterCheqd'}
					<FilterCheqd styles="h-4 w-4" />
				{:else if o.icon === 'FilterWaltid'}
					<FilterWaltid styles="h-4 w-4" />
					<!-- Types -->
				{:else if o.value === CredentialTypeSchema.enum.Achievements}
					<Achievement styles="h-4 w-4" />
				{:else if o.value === CredentialTypeSchema.enum.Roles}
					<Role styles="h-4 w-4" />
				{:else if o.value === CredentialTypeSchema.enum.Events}
					<Event styles="h-4 w-4" />
				{:else if o.value === CredentialTypeSchema.enum.Socials}
					<Social styles="h-4 w-4" />
				{:else if o.value === CredentialTypeSchema.enum.Tickets}
					<TicketIcon class="h-4 w-4 fill-white text-black" />
				{:else if o.value === CredentialTypeSchema.enum.Learn}
					<BookOpenIcon class="h-4 w-4 fill-white text-black" />
				{:else if o.value === CredentialTypeSchema.enum.Endorsement}
					<Reputation styles="h-4 w-4" />
				{/if}
				<span class="text-sm text-white">{o.label}</span>
			</div>
		{/each}
	</div>
</div>
