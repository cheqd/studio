<script lang="ts">
	import Disclosure from './Disclosure.svelte';
	import { isDiscordBaseCredential, isCommunityRoleBaseCredential, type WebPageListType } from '$shared/types';
	import type { BaseCredentialType } from '$shared/types';
	export let presentationData: BaseCredentialType;

	const formatPresentationSubject = () => {
		if (isDiscordBaseCredential(presentationData)) {
			const ds = presentationData.credentialSubject;
			return {
				description: ds.socialProfile.description,
				displayName: (ds.socialProfile.webPage as WebPageListType)[0].name,
				username: (ds.socialProfile.webPage as WebPageListType)[0].identifier,
			};
		}

		if (isCommunityRoleBaseCredential(presentationData)) {
			const cs = presentationData.credentialSubject;
			return {
				description: cs.communityRole?.description,
				displayName: (cs.socialProfile.webPage as WebPageListType)[0].name,
				issueNumber: (cs.socialProfile.webPage as WebPageListType)[0].identifier,
			};
		}
	};

	$: presentationSubject = formatPresentationSubject();
</script>

<div class="'override-scrollbar-config ' h-40 overflow-visible overflow-y-scroll rounded-xl text-lg">
	<div class="flex flex-col items-center justify-start gap-2 px-4 py-2 text-white">
		{#if presentationData.type}
			<Disclosure label="Type" showPanel={true}>
				<span class="antialiased">{presentationData.type.join(', ')}</span>
			</Disclosure>
		{/if}

		<Disclosure label="Description" showPanel={true}>
			<span class="antialiased">{presentationSubject?.description}</span>
		</Disclosure>

		<Disclosure label="Display Name" showPanel={true}>
			<span class="antialiased">{presentationSubject?.displayName}</span>
		</Disclosure>

		{#if presentationSubject && presentationSubject.username}
			<Disclosure label="User Name" showPanel={true}>
				<span class="antialiased">@{presentationSubject.username}</span>
			</Disclosure>
		{/if}

		{#if presentationSubject && presentationSubject.issueNumber}
			<Disclosure label="Issue Number" showPanel={true}>
				<span class="antialiased">{presentationSubject.issueNumber}</span>
			</Disclosure>
		{/if}
	</div>
</div>
