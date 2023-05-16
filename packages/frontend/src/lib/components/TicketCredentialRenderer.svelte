<script lang="ts">
	import TooltipIcon from '$lib/icons/TooltipIcon.svelte';
	import { CredentialTypeSchema, TicketCredentialSubjectSchema } from '$shared/schema';
	import type { CredentialType, TicketCredentialSubjectType, WebPageListType } from '$shared/types';
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
		let ticketSubject: TicketCredentialSubjectType;

		ticketSubject = TicketCredentialSubjectSchema.parse(baseCredential.credentialSubject);
		const location = ticketSubject.ticket.reservationFor.location;
		return {
			name: (ticketSubject.socialProfile.webPage as WebPageListType)[0].name,
			username: (ticketSubject.socialProfile.webPage as WebPageListType)[0].identifier,
			description: ticketSubject.ticket.description,
			eventName: ticketSubject.ticket.reservationFor.name,
			startDate: ticketSubject.ticket.reservationFor.startDate,
			location: location.name + ', ' + location.address.addressCountry,
		};
	};

	$: subject = formatPresentationSubject();
	export { isDesktop, isMobile, credential };
</script>

{#if credential && credential.appMeta.category === CredentialTypeSchema.enum.Tickets}
	<div class="override-scrollbar-config h-5/6 rounded-xl text-lg">
		{#if credential.credential.type}
			<div class="{applyMobileStyles(0)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />
				<span class="font-medium">Type:</span>

				<div class="scrollable-without-scrollbar flex md:w-full w-60 gap-3 overflow-x-scroll">
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

		{#if subject.eventName}
			<div class="{applyMobileStyles(3)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />

				<span class="font-medium">Event Name:</span>
				<span class="font-light antialiased">{subject.eventName}</span>
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

		{#if subject.location}
			<div class="{applyMobileStyles(3)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />

				<span class="font-medium">Location:</span>
				<span class="font-light antialiased">{subject.location}</span>
			</div>
		{/if}
	</div>
{/if}
