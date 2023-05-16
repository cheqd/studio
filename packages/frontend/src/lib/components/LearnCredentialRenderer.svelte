<script lang="ts">
	import TooltipIcon from '$lib/icons/TooltipIcon.svelte';
	import { CredentialTypeSchema, LearnCredentialSubjectSchema } from '$shared/schema';
	import type { CredentialType, LearnCredentialSubjectType, WebPageListType } from '$shared/types';
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
		let learnSubject: LearnCredentialSubjectType;

		learnSubject = LearnCredentialSubjectSchema.parse(baseCredential.credentialSubject);
		return {
			name: (learnSubject.socialProfile.webPage as WebPageListType)[0].name,
			username: (learnSubject.socialProfile.webPage as WebPageListType)[0].identifier,
			description: learnSubject.learn.description,
			award: learnSubject.learn.educationalCredentialAwarded,
			level: learnSubject.learn.educationalLevel,
			provider: learnSubject.learn.provider.name,
		};
	};

	$: subject = formatPresentationSubject();
	export { isDesktop, isMobile, credential };
</script>

{#if credential && credential.appMeta.category === CredentialTypeSchema.enum.Learn}
	<div class="override-scrollbar-config h-5/6 rounded-xl text-lg">
		{#if credential.credential.type}
			<div class="{applyMobileStyles(0)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />
				<span class="font-medium">Type:</span>

				<div class="scrollable-without-scrollbar flex w-60 gap-3 overflow-x-scroll md:w-full">
					{#each credential.credential.type as ct}
						<Chip showCloseIcon={false} label={ct} styles="flex-shrink-0" />
					{/each}
				</div>
			</div>
		{/if}
		{#if subject.name}
			<div class="{applyMobileStyles(1)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400 flex-shrink-0" />

				<span class="font-medium">Display Name:</span>
				<span class="font-light antialiased">{subject.name}</span>
			</div>
		{/if}

		{#if subject.username}
			<div class="{applyMobileStyles(2)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />

				<span class="font-medium">Username:</span>
				<span class="font-light antialiased">@{subject.username}</span>
			</div>
		{/if}

		{#if subject.award}
			<div class="{applyMobileStyles(3)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />

				<span class="font-medium">Award:</span>
				<span class="font-light antialiased">{subject.award}</span>
			</div>
		{/if}

		{#if subject.level}
			<div class="{applyMobileStyles(3)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />

				<span class="font-medium">Education Level:</span>
				<span class="font-light antialiased">{subject.level}</span>
			</div>
		{/if}

		{#if subject.provider}
			<div class="{applyMobileStyles(3)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />

				<span class="font-medium">Provider:</span>
				<span class="font-light antialiased">{subject.provider}</span>
			</div>
		{/if}
	</div>
{/if}
