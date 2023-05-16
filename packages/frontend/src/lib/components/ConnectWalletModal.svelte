<script lang="ts">
	import {
		Dialog,
		DialogOverlay,
		DialogTitle,
		DialogDescription,
		Transition,
		TransitionChild,
	} from '@rgossiaux/svelte-headlessui';

	import OutlineButton from './OutlineButton.svelte';
	import WalletInfo from './WalletInfo.svelte';

	let title = '';
	let description = '';
	let openModal = false;

	export { title, description, openModal };
</script>

<Transition show={openModal}>
	<Dialog
		as="div"
		class="relative z-10"
		open={openModal}
		on:close={() => {
			openModal = false;
		}}
	>
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
					class="flex w-full items-center justify-center lg:w-1/3"
				>
					<div
						class="flex h-full w-full max-w-7xl transform overflow-hidden rounded-2xl bg-primary-800 p-8 text-left align-middle shadow-xl transition-all lg:max-w-5xl"
					>
						<div class="flex w-full flex-col">
							<DialogTitle as="div" class="flex flex-col py-2 text-xl font-bold leading-6 text-white">
								{title}
							</DialogTitle>
							<DialogDescription as="div" class="flex flex-col pb-4 text-sm leading-6 text-white">
								{description}
							</DialogDescription>
							<div class="flex h-full flex-col justify-between gap-2">
								<WalletInfo walletName="Metamask" logoClasses="h-8 w-8" logoSrc="/metamask.png" />
								<WalletInfo walletName="Keplr" logoClasses="h-8 w-8" logoSrc="/keplr-logo.png" />
								<WalletInfo
									walletName="Wallet connect"
									logoClasses="h-6 w-8"
									logoSrc="/wallet-connect-logo.svg"
								/>
							</div>
							<div class="mt-4 flex w-full items-center justify-center gap-6">
								<OutlineButton
									on:click={() => {
										openModal = false;
									}}
									styles="w-2/3"
									innerStyles="w-full bg-primary-800"
								>
									Close
								</OutlineButton>
							</div>
						</div>
					</div>
				</TransitionChild>
			</div>
		</div>
	</Dialog>
</Transition>
