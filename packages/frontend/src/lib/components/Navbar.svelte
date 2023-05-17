<script lang="ts">
	import { page } from '$app/stores';
	import Cross from '../icons/Cross.svelte';
	import Dashboard from '../icons/Dashboard.svelte';
	import Logout from '../icons/Logout.svelte';
	import Menu from '../icons/Menu.svelte';
	import Share from '../icons/Share.svelte';
	import OutlineButton from './OutlineButton.svelte';
	import { onMount } from 'svelte';
	import HorizontalRule from './HorizontalRule.svelte';
	import Delete from '$lib/icons/Delete.svelte';
	import Profile from '$lib/icons/Profile.svelte';
	import Settings from '$lib/icons/Settings.svelte';
	let visible = false;

	export let authorised = false;
	const handleClick = () => (visible = !visible);
	let isLoading = false;

	let isMobile = true;

	onMount(() => {
		isMobile = window.matchMedia('(max-width: 1024px)').matches;

		const handleScreenChange = () => {
			if (window.matchMedia('(max-width: 1024px)').matches) {
				isMobile = true;
			} else {
				isMobile = false;
			}
		};

		window.addEventListener('resize', handleScreenChange);
		// this will auto-remove the event listener
		return () => window.removeEventListener('resize', handleScreenChange);
	});

	let route: string | null;

	$: {
		route = $page.route.id;
	}

	const signout = async () => {
		const response = await fetch('/api/logto/signout', {
			method: 'DELETE',
			redirect: 'manual',
		});

		if (response.status === 201) {
			// flush sessionStorage
			sessionStorage.clear();

			window.open(response.headers.get('Location')!, '_self');
		}

		console.log('signout error: ', await response.text());
	};

	let isResetLoading = false;
	const resetUserState = async () => {
		isResetLoading = true;
		const response = await fetch('/api/cheqd/credentials?reset=true', { method: 'DELETE' });
		isResetLoading = false;
		if (response.status !== 204) {
			console.log('error in credential reset: ', await response.text());
		}
		window.location.reload();
	};
</script>

<header class="sticky top-0 z-10 w-full bg-nav-bar-bg bg-opacity-30 py-4 backdrop-blur-lg backdrop-filter">
	<nav class=" flex justify-center px-4">
		<div class="container max-w-[2000px] px-4 lg:px-8">
			<div class="flex flex-col md:items-center md:justify-between lg:flex-row">
				<div class="flex items-center justify-between sm:w-full lg:w-fit">
					<div class="half:ml-5 flex cursor-pointer items-center justify-center whitespace-nowrap">
						<a href="/">
							<img src="/cheqd-logo.svg" alt="creds logo" class="h-7 w-28" />
						</a>
					</div>
					{#if authorised}
						<button
							data-collapse-toggle="navbar-default"
							type="button"
							class="ml-3 inline-flex items-center rounded-lg p-2 text-sm text-gray-500 lg:hidden"
							aria-controls="navbar-default"
							aria-expanded="false"
							on:click={handleClick}
						>
							{#if visible}
								<Cross />
							{:else}
								<Menu styles="outline-none" />
							{/if}
						</button>
					{/if}
				</div>
				{#if authorised}
					<form
						class={visible
							? 'mt-6 flex w-full flex-col space-y-4 lg:mt-0 lg:flex-row lg:justify-end lg:space-y-0'
							: 'mt-2 hidden w-full justify-end md:mx-1 md:mt-0 lg:flex lg:space-x-8'}
					>
						{#if isMobile}
							<OutlineButton
								loading={isLoading}
								on:click={signout}
								innerStyles="w-full justify-start"
								styles="bg-none justify-start"
							>
								<Logout styles="lg:hidden" />
								Log out
							</OutlineButton>
						{:else}
							<OutlineButton
								loading={isLoading}
								on:click={signout}
								innerStyles="bg-nav-bar-bg w-full justify-start"
								styles="justify-start"
							>
								<Logout styles="lg:hidden" />
								Log out
							</OutlineButton>
						{/if}
					</form>
				{/if}
			</div>
		</div>
	</nav>
</header>
