<script lang="ts">
	import Chip from './Chip.svelte';
	import Button from './Button.svelte';
	import Share from '$lib/icons/Share.svelte';
	import type { CredentialSetType, CredentialType } from '$shared/types';

	let handleCancelSharing: () => void;
	let listItems: CredentialSetType;
	let handleSelectedCredential: (c: CredentialType) => void;

	let handleCredentialsShare: (credentials: CredentialSetType) => Promise<void>;
	let isLoading = false;
	const wrapHandleCredentialsShare = async (listItems: CredentialSetType) => {
		isLoading = true;
		await handleCredentialsShare(listItems);
		isLoading = false;
	};
	export { listItems, handleSelectedCredential, handleCancelSharing, handleCredentialsShare };
</script>

<div class="mt-4 flex flex-col items-start justify-start gap-2 rounded-xl bg-primary-800 p-4">
	<div>
		<span class="m-0 hidden p-0 text-xl text-gray-100 lg:inline">Selected Credentials</span>
		<span class="p-0 text-xl text-gray-100 lg:hidden">Selected Credentials({listItems.size})</span>
	</div>
	<div class="flex w-full flex-col justify-between gap-2 px-1 py-2">
		<div
			class="override-scrollbar-config grid h-24 grid-cols-2 gap-2 overflow-visible overflow-y-scroll md:flex md:h-auto md:flex-row md:flex-wrap md:gap-4 lg:overflow-hidden"
		>
			{#each Array.from(listItems) as cred, id (cred.credential.id ?? cred.appMeta.internalCredentialId)}
				<Chip
					on:click={() => handleSelectedCredential(cred)}
					id={id.toString()}
					label={cred?.appMeta?.typeAlias?.slice(0, 15) ?? ''}
					styles="w-36 h-8 lg:w-auto"
				>
					<img alt="" class="m-0 h-6 w-6 rounded-2xl p-0" src={'/credential-background-placeholder.webp'} />
				</Chip>
			{/each}
		</div>
		<div class="mt-6 flex flex-col justify-between lg:flex-row">
			<div class="w-2/6">
				<span class="hidden text-sm text-gray-300 lg:inline">{listItems.size} credentials selected</span>
			</div>
			<div class=" flex w-full justify-between lg:justify-end lg:space-x-4">
				<Button on:click={handleCancelSharing} styles="bg-none">Cancel</Button>
				<Button
					on:click={() => {
						wrapHandleCredentialsShare(listItems);
					}}
					loading={isLoading}
				>
					Share credential(s)
					<Share />
				</Button>
			</div>
		</div>
	</div>
</div>
