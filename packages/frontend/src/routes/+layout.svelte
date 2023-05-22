<script lang="ts">
	import '../app.css';
	import Footer from '$lib/components/Footer.svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import { browser } from '$app/environment';
	import type { LayoutData } from './$types';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';

	export let data: LayoutData;

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
