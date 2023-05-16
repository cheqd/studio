<script lang="ts">
	import { Dialog, DialogOverlay, Transition, TransitionChild } from '@rgossiaux/svelte-headlessui';
    import Textfield from './Textfield.svelte';
	import OutlineButton from './OutlineButton.svelte';
	import IconButton from './IconButton.svelte';
	import Cross from '$lib/icons/Cross.svelte';
	import Logout from '$icons/Logout.svelte';

	let isOpen = false;
	let handleModal: () => void;
	let passphrase = '';
	let hasBeenSet = false;
	let isInvalidPassphrase = false;
	let abilityToCancel = true;

	let h1: string;
	let description: string;

	const handleSetPassphrase = () => {
		hasBeenSet = true;
		handleModal();
	};

	const handleCancel = () => {
		handleModal();
		hasBeenSet = false;
	};

	const handleInternalLogout = async () => {
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

	export { isOpen, handleModal, passphrase, hasBeenSet, isInvalidPassphrase, abilityToCancel, h1, description };
</script>

<Transition show={isOpen}>
	<Dialog as="div" class="relative z-10 h-full w-full" open={isOpen} on:close={handleModal}>
		<TransitionChild
			enter="ease-out duration-50"
			enterFrom="opacity-0"
			enterTo="opacity-70"
			leave="ease-in duration-100"
			leaveFrom="opacity-100"
			leaveTo="opacity-0"
		>
			<div class="fixed inset-0 bg-gray-700 bg-opacity-80" />
			<DialogOverlay />
		</TransitionChild>

		<div class="fixed inset-0 overflow-y-auto">
			<div class="flex min-h-full items-center justify-center p-4 text-center">
				<TransitionChild
					enter="ease-out duration-200"
					enterFrom="opacity-0 scale-95"
					enterTo="opacity-100 scale-100"
					leave="ease-in duration-200"
					leaveFrom="opacity-100 scale-100"
					leaveTo="opacity-0 scale-95"
					class="flex w-full items-center justify-center lg:w-2/5"
				>
				<div>
					{#if abilityToCancel}
						<IconButton
							styles="absolute top-0 right-0 z-2 mt-7 mr-7 h-7 w-7 rounded-lg"
							on:click={handleCancel}
						>
							<Cross />
						</IconButton>
					{:else}
						<OutlineButton
							on:click={handleInternalLogout}
							innerStyles="w-auto absolute top-0 right-0 z-2 mt-7 mr-7 h-7 w-7 rounded-lg"
							styles="bg-none"
						>
							<Logout styles="lg:hidden" />
						</OutlineButton>
					{/if}
					<div
						class="flex h-full w-half max-w-7xl transform overflow-hidden rounded-2xl bg-primary-800 p-8 text-left align-middle shadow-xl transition-all lg:max-w-5xl"
					>
						<div>
							<h1 class="text-2xl font-bold text-white text-center pb-2">{@html h1}</h1>
							<p class="text-sm text-gray-300 text-center">{@html description}</p>
							<div class="flex w-full flex-col">
								<Textfield
									type="password"
									placeholder="Enter your passphrase..."
									bind:value={passphrase}
								/>
								<div class="place-self-center px-8 pt-4">
									<OutlineButton
										loading={false}
										loadingTitle="Redirecting to dashboard"
										styles="w-full"
										innerStyles="bg-primary-800 w-full px-4 lg:px-8"
										on:click={handleSetPassphrase}
									>
										Enter
									</OutlineButton>
								</div>
								<div>
									{#if isInvalidPassphrase}
										<p class="text-sm text-red-500 text-center pt-2">Invalid passphrase.</p>
									{/if}
								</div>
								<slot />
							</div>
						</div>
					</div>
				</div>
				</TransitionChild>
			</div>
		</div>
	</Dialog>
</Transition>
