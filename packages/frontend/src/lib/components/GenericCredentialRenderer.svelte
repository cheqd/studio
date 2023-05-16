<script lang="ts">
	import TooltipIcon from '$lib/icons/TooltipIcon.svelte';
	import { BaseCredentialSubject } from '$shared/schema';
	import type { BaseCredentialSubjectType, CredentialType, WebPageListType } from '$shared/types';
	import Chip from './Chip.svelte';
	let isMobile = false;

	const applyMobileStyles = (i: number) => {
		if (isMobile) {
			return `${i % 2 === 0 ? 'bg-gray-800' : ''} text-xs`;
		} else {
			return '';
		}
	};

	let isDesktop = false;
	const applyDesktopStyles = () => (isDesktop ? 'bg-gray-800' : '');

	let credential: CredentialType;

	const formatPresentationSubject = () => {
		const { credential: baseCredential } = credential;
		let roleSubject: BaseCredentialSubjectType;

		roleSubject = BaseCredentialSubject.parse(baseCredential.credentialSubject);
		return {
			name: (roleSubject.socialProfile.webPage as WebPageListType)[0].name,
			username: (roleSubject.socialProfile.webPage as WebPageListType)[0].identifier,
			description: roleSubject.socialProfile.description,
		};
	};

	$: subject = formatPresentationSubject();
	export { isDesktop, isMobile, credential };
</script>

{#if credential}
	<div class="override-scrollbar-config h-5/6 rounded-xl text-lg">
		{#if credential.credential.type}
			<div class="{applyMobileStyles(0)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />
				<span class="font-medium">Type:</span>

				<div class="scrollable-without-scrollbar flex w-60 gap-3 overflow-x-scroll md:w-full">
					{#each credential.credential.type as ct}
						<Chip showCloseIcon={false} label={ct} styles="flex-shrink-0 drop-shadow-md" />
					{/each}
				</div>
			</div>
		{/if}
		<div class="{applyMobileStyles(1)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
			<TooltipIcon styles="text-gray-400 flex-shrink-0" />

			<span class="font-medium">Display Name:</span>
			<span class="font-light antialiased">{subject.name}</span>
		</div>

		<div class="{applyMobileStyles(2)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
			<TooltipIcon styles="text-gray-400" />

			<span class="font-medium">Username:</span>
			<span class="font-light antialiased">@{subject.username}</span>
		</div>
	</div>
{/if}
