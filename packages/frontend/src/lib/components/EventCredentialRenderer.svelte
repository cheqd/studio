<script lang="ts">
	import TooltipIcon from '$lib/icons/TooltipIcon.svelte';
	import { CredentialTypeSchema, EventCredentialSubjectSchema } from '$shared/schema';
	import type { CredentialType, EventCredentialSubjectType, WebPageListType } from '$shared/types';
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
		let eventSubject: EventCredentialSubjectType;

		eventSubject = EventCredentialSubjectSchema.parse(baseCredential.credentialSubject);
		return {
			name: (eventSubject.socialProfile.webPage as WebPageListType)[0].name,
			username: (eventSubject.socialProfile.webPage as WebPageListType)[0].identifier,
			description: eventSubject.event.description,
			startDate: eventSubject.event.startDate,
			attendanceMode: eventSubject.event.eventAttendanceMode,
			organizer: eventSubject.event.organizer,
		};
	};

	const isURL = (value: string) => {
		try {
			return Boolean(new URL(value));
		} catch {
			return false;
		}
	};

	$: subject = formatPresentationSubject();
	export { isDesktop, isMobile, credential };
</script>

{#if credential && credential.appMeta.category === CredentialTypeSchema.enum.Events}
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

		{#if subject.startDate}
			<div class="{applyMobileStyles(3)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />

				<span class="font-medium">Start Date:</span>
				<span class="font-light antialiased">
					{new Date(subject.startDate).toDateString() +
						' ' +
						new Date(subject.startDate).toLocaleTimeString()}
				</span>
			</div>
		{/if}

		{#if subject.attendanceMode}
			<div class="{applyMobileStyles(3)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />

				<span class="font-medium">Attendance Mode:</span>
				<a href={subject.attendanceMode} target="_blank" rel="noreferrer">
					<span class="font-light underline antialiased"
						>{subject.attendanceMode.split('/')[subject.attendanceMode.split('/').length - 1]}</span
					>
				</a>
			</div>
		{/if}

		{#if subject.organizer}
			<div class="{applyMobileStyles(3)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />

				<span class="font-medium">Organizer:</span>
				{#if isURL(subject.organizer)}
					<a href={subject.organizer} target="_blank">
						<span class="font-light underline antialiased">{subject.organizer}</span>
					</a>
				{:else}
					<span class="font-light antialiased">{subject.organizer}</span>
				{/if}
			</div>
		{/if}
	</div>
{/if}
