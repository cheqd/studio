<script lang="ts">
	import { Dialog, DialogOverlay, Transition, TransitionChild } from '@rgossiaux/svelte-headlessui';
	import { twMerge } from 'tailwind-merge';

	let openModal = false;
	let styles = '';
	let handleModal: () => void;

	export { openModal, handleModal, styles };
</script>

<Transition show={openModal}>
	<Dialog as="div" class={twMerge('relative z-10 h-full w-full', styles)} open={openModal} on:close={handleModal}>
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
					<div
						class="flex h-full w-full max-w-7xl transform overflow-hidden rounded-2xl bg-primary-800 p-8 text-left align-middle shadow-xl transition-all lg:max-w-5xl"
					>
						<div class="flex w-full flex-col">
							<slot />
						</div>
					</div>
				</TransitionChild>
			</div>
		</div>
	</Dialog>
</Transition>
