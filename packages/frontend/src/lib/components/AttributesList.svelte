<script lang="ts">
	import { CredentialTypeSchema } from '$shared/schema';
	import type { CredentialType } from '$shared/types';
	import EventCredentialRenderer from './EventCredentialRenderer.svelte';
	import GenericCredentialRenderer from './GenericCredentialRenderer.svelte';
	import LearnCredentialRenderer from './LearnCredentialRenderer.svelte';
	import RolesCredentialRenderer from './RolesCredentialRenderer.svelte';
	import TicketCredentialRenderer from './TicketCredentialRenderer.svelte';
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

	export { isDesktop, isMobile, credential };
</script>

<div class="h-full w-full">
	{#if credential}
		{#if credential.appMeta.category === CredentialTypeSchema.enum.Events}
			<EventCredentialRenderer {credential} />
		{:else if credential.appMeta.category === CredentialTypeSchema.enum.Roles}
			<RolesCredentialRenderer {credential} />
		{:else if credential.appMeta.category === CredentialTypeSchema.enum.Learn}
			<LearnCredentialRenderer {credential} />
		{:else if credential.appMeta.category === CredentialTypeSchema.enum.Tickets}
			<TicketCredentialRenderer {credential} />
		{:else}
			<GenericCredentialRenderer {credential} />
		{/if}
	{:else}
		<div class="{applyMobileStyles(0)} {applyDesktopStyles()} flex items-center justify-start gap-2 px-4 py-2">
			<span>No attributes found</span>
		</div>
	{/if}
</div>
