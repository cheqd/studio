<script lang="ts">
	import '../app.css';
	import FloatingActionButton from '$lib/components/FloatingActionButton.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import HorizontalRule from '$lib/components/HorizontalRule.svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import type { CheckBoxButtonOption } from '$lib/client/types';
	import { browser } from '$app/environment';
	import type { LayoutData } from './$types';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { CredentialTypeSchema } from '$shared/schema';

	export let data: LayoutData;
	let showSidebar = false;
	const handleSideBarToggle = () => (showSidebar = !showSidebar);

	let height = '';
	if (browser) {
		height = 'min-h-[' + window.screen.height + 'px]';
	}


	afterNavigate(async ({ type }) => {
		if (type === 'enter' && $page.url.pathname === '/') {
			const response = await fetch('/api/logto/session');
		}
	});
</script>

<Navbar authorised={data.authenticated} />
<div class="{height} flex h-full w-full flex-col items-center">
	<div class="flex w-full items-center justify-center">
		<div class="flex h-full w-full max-w-[2000px] flex-col">
			<div class="lg:flex lg:justify-center">
				<slot />
			</div>
		</div>
	</div>
	{#if !data.authenticated}
		<Footer />
	{/if}
</div>
