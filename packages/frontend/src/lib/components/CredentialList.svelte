<script lang="ts">
	import MobileCredentialModal from './MobileCredentialModal.svelte';
	import { onMount } from 'svelte';
	import Refresh from '$lib/icons/Refresh.svelte';
	import Button from './Button.svelte';
	import CredentialCard from './CredentialCard.svelte';
	import CredentialModal from './CredentialModal.svelte';
	import { CredentialClaimStatusSchema } from '$shared/schema';
	import type {
		TupleAsyncSingleCredentialHandlerType,
		GenericAsyncSingleCredentialHandlerType,
	} from '$lib/client/types';

	import type { CredentialListType } from '$shared/types';
	import type { CredentialSetType, CredentialType } from '$shared/types';

	export let selectedCredentials: CredentialSetType;
	export let handleCredentialClaim: TupleAsyncSingleCredentialHandlerType;
	export let handleCredentialShare: GenericAsyncSingleCredentialHandlerType;

	let claimProgress: string;
	let notEligible: string;
	let description: string;
	let credentials: CredentialListType;
	let mode: 'share' | '';
	let title = '';
	let handleCredential: GenericAsyncSingleCredentialHandlerType;
	let fetchUserCredentials: () => Promise<void>;

	export {
		claimProgress,
		notEligible,
		description,
		credentials,
		mode,
		title,
		handleCredential,
		fetchUserCredentials,
	};

	let isLoading = false;
	const wrapFetchUserCredentials = async () => {
		isLoading = true;
		await fetchUserCredentials();
		isLoading = false;
	};

	let openModal = false;
	let isMobile = true;

	const handleModal = () => {
		openModal = !openModal;
	};

	onMount(() => {
		isMobile = window.matchMedia('(max-width: 700px)').matches;

		const handleScreenChange = () => {
			if (window.matchMedia('(max-width: 700px)').matches) {
				isMobile = true;
			} else {
				isMobile = false;
			}
		};

		window.addEventListener('resize', handleScreenChange);
		// this will auto-remove the event listener
		return () => window.removeEventListener('resize', handleScreenChange);
	});

	let activeCredential: CredentialType | null = null;
	const setActiveCredential = async (cred: CredentialType) => {
		openModal = true;
		activeCredential = cred;
	};

	const handleDeleteCredential = async (credentialId: string) => {
		const response = await fetch('/api/cheqd/credentials?credentialId=' + credentialId, {
			method: 'DELETE',
		});
		if (response.status !== 204) {
			console.log('status: %s response: %s', response.status, await response.text());
			return;
		}

		await fetchUserCredentials();
	};
</script>

<div class="h-full w-full">
	<div class="mt-8">
		<div class="flex items-center justify-start gap-2 text-white">
			<slot />
			<h2 class="m-0 p-0 text-xl font-semibold text-white">{title}</h2>
			{#if claimProgress !== '' && notEligible !== ''}
				<div class="flex w-full justify-end space-x-2 lg:ml-8 lg:justify-start lg:space-x-0">
					<div
						class="order-last flex items-center justify-center rounded-2xl border-2 border-blue-300 px-4 text-xs font-extralight text-white"
					>
						{claimProgress}
					</div>

					<div class="order-1 flex items-center space-x-3 text-xs font-extralight lg:order-last">
						<span
							class="flex h-4 w-4 items-center justify-center rounded-full bg-primary-error p-4 text-white opacity-70 lg:hidden"
						>
							{notEligible}
						</span>
						<span class="mx-4" />
						<span
							class="hidden items-center justify-center bg-primary-error py-1 text-white lg:flex lg:rounded-2xl lg:px-4"
						>
							{notEligible} not eligible
						</span>
					</div>
				</div>
			{/if}
		</div>
	</div>
	<div class="mb-8 mt-4 text-white">
		<span class="text-sm font-extralight leading-snug tracking-tight">{description}</span>
	</div>

	{#if credentials.length > 0}
		<div class="scrollable-without-scrollbar flex flex-row gap-4 overflow-x-scroll text-white lg:flex-wrap pt-4">
			{#each credentials as cred, index (cred.appMeta.internalCredentialId || index)}
				{#if cred.appMeta.status === CredentialClaimStatusSchema.enum.INELIGIBLE}
					<CredentialCard
						{setActiveCredential}
						{handleCredentialShare}
						{handleCredentialClaim}
						handleOnChecked={() => handleCredential(cred)}
						{mode}
						claimStatus={cred.appMeta.status}
						isCredentialSelected={selectedCredentials.has(cred)}
						credential={cred}
						on:credentialClaimed
						on:secretBoxStored
					/>
				{:else if cred.appMeta.status === CredentialClaimStatusSchema.enum.CLAIM_PENDING}
					<CredentialCard
						{setActiveCredential}
						{handleCredentialShare}
						{handleCredentialClaim}
						handleOnChecked={() => {
							handleCredential(cred);
						}}
						{mode}
						claimStatus={cred.appMeta.status}
						isCredentialSelected={selectedCredentials.has(cred)}
						credential={cred}
						on:credentialClaimed
						on:secretBoxStored
					/>
				{:else}
					<CredentialCard
						{setActiveCredential}
						{handleCredentialShare}
						{handleCredentialClaim}
						handleOnChecked={() => {
							handleCredential(cred);
						}}
						{mode}
						claimStatus={cred.appMeta.status}
						isCredentialSelected={selectedCredentials.has(cred)}
						credential={cred}
						on:credentialClaimed
						on:secretBoxStored
					/>
				{/if}
			{/each}
		</div>
		{#if isMobile && activeCredential}
			<MobileCredentialModal {handleDeleteCredential} {openModal} {handleModal} credential={activeCredential} />
		{:else if activeCredential}
			<CredentialModal {handleDeleteCredential} credential={activeCredential} {openModal} {handleModal} />
		{/if}
	{:else}
		<div
			class="relative my-4 flex w-full flex-col items-center justify-center gap-4 rounded-2xl py-4 text-gray-100"
		>
			<picture>
				<img alt="" src="/no-credentials-background.png" class="h-[12rem] w-full" />
			</picture>
			<div class="absolute flex flex-col items-center justify-center gap-4">
				<span class="break-words text-2xl">
					You do not have any {title} credentials. Refresh or check later
				</span>
				<Button loading={isLoading} on:click={wrapFetchUserCredentials}>
					Refresh
					<Refresh />
				</Button>
			</div>
		</div>
	{/if}
</div>
