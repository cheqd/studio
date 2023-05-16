<script lang="ts">
	import Check from '$lib/icons/Check.svelte';
	import ChevronLeft from '$lib/icons/ChevronLeft.svelte';
	import Cross from '$lib/icons/Cross.svelte';
	import Delete from '$lib/icons/Delete.svelte';
	import Share from '$lib/icons/Share.svelte';
	import type { CredentialType, CredentialPresentationRequest, PresentationResult } from '$shared/types';
	import { Transition, TransitionChild, Dialog, DialogTitle, DialogOverlay } from '@rgossiaux/svelte-headlessui';
	import AttributesList from './AttributesList.svelte';
	import Button from './Button.svelte';
	import HorizontalRule from './HorizontalRule.svelte';
	import IconButton from './IconButton.svelte';
	import OutlineButton from './OutlineButton.svelte';
	import VerificationPolicyList from './VerificationPolicyList.svelte';
	import type { GenericAsyncVoidFuctionType } from '$lib/client/types';
	import CopyFromTextfield from './CopyFromTextfield.svelte';
	import { DefaultCheqdIssuerLogo } from '$shared/constants';
	import { handleCredentialImageLoadFail } from '$client';

	let openModal = false;
	let handleModal: () => void;
	let credential: CredentialType;
	let showActionButtons = true;

	let presentationResult: PresentationResult | null;

	let presentationShareURL = '';
	const shareCredential = async (credential: CredentialType) => {
		const { credential: baseCredential } = credential;
		const credentialType = baseCredential.type;
		const credentialId = baseCredential.id;
		if (credentialType && credentialId) {
			const cred: CredentialPresentationRequest = {
				credentialType,
				credentialIDs: [credentialId],
			};

			const response = await fetch('/api/cheqd/credentials/present', {
				method: 'POST',
				redirect: 'manual',
				body: JSON.stringify(cred),
			});

			const data = await response.json();
			if (response.status === 201) {
				presentationResult = data as PresentationResult;
				presentationShareURL = presentationResult.url;

				return;
			}

			console.log('error in presentation: ', data);
		}
	};

	let isLoading = false;
	let isCheckStatusLoading = false;

	let isMoreToLeft = true;
	let isMoreToRight = true;

	let handleDeleteCredential: GenericAsyncVoidFuctionType;
	export {
		credential,
		handleModal,
		openModal,
		showActionButtons,
		isMoreToLeft,
		isMoreToRight,
		handleDeleteCredential,
	};

	const wrapCredentialShare = async () => {
		isLoading = true;
		await shareCredential(credential);
		isLoading = false;
	};

	const checkPresensationPolicies = async () => {
		isCheckStatusLoading = true;
		await shareCredential(credential);
		isCheckStatusLoading = false;
	};

	const wrapHandleModal = () => {
		presentationResult = null;
		presentationShareURL = '';
		handleModal();
	};

	let isDeleteLoading = false;
	const wrapHandleDeleteCredential = async (credentialId: string) => {
		if (handleDeleteCredential) {
			isDeleteLoading = true;
			await handleDeleteCredential(credentialId);
			isDeleteLoading = false;
			handleModal();
		}
	};
</script>

<svelte:head>
	<link rel="preload" as="image" href={'/credential-background-placeholder-vert.png'} />
</svelte:head>

<Transition show={openModal}>
	<Dialog as="div" class="relative z-50" open={openModal} on:close={() => (openModal = false)}>
		<TransitionChild
			enter="ease-out duration-50"
			enterFrom="opacity-0"
			enterTo="opacity-70"
			leave="ease-in duration-100"
			leaveFrom="opacity-100"
			leaveTo="opacity-0"
		>
			<div class="fixed inset-0 bg-gray-700 bg-opacity-50" />
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
				>
					<div
						class="z-50 flex h-full w-full max-w-7xl transform overflow-hidden rounded-2xl bg-primary-800 p-6 text-left align-middle shadow-xl transition-all lg:max-w-5xl"
					>
						<div class="flex w-2/3 flex-col">
							<DialogTitle as="div" class="flex flex-col py-4 text-lg font-bold leading-6 text-white">
								<div class="flex items-center gap-4">
									<div class="rounded-full">
										<picture>
											<img alt="" class="h-28 w-28 rounded-full" src={DefaultCheqdIssuerLogo} />
										</picture>
									</div>
									<div class="flex flex-col gap-2">
										<div class="flex flex-col">
											<h1 class="text-3xl">{credential.appMeta.typeAlias}</h1>
											<span class="flex items-center justify-start gap-2 text-sm text-gray-400">
												issued by
												<span class="flex items-center justify-start gap-2 text-lg text-white">
													cheqd
													<Check styles="fill-blue-400 text-white" />
												</span>
											</span>
										</div>
										<!-- <div class="my-2 flex gap-4">
											<div class="flex gap-1">
												<Person styles="fill-blue-500 stroke-blue-500" />
												<span class="text-white">{1}</span>
											</div>
											<div class="flex gap-1">
												<CreditCard styles="fill-blue-500 stroke-blue-500" />
												<span class="text-white ">{50}</span>
											</div>
											<div class="flex gap-1">
												<Airplane styles="fill-blue-500 stroke-blue-500" />
												<span class="text-white">{103}</span>
											</div>
										</div> -->
									</div>
								</div>
							</DialogTitle>
							<HorizontalRule />
							<div class="flex h-full flex-col justify-between">
								<div>
									<div class="my-8">
										<p class="text-lg text-gray-200">
											{credential.appMeta.description}
										</p>
									</div>
									<HorizontalRule />

									<div class="h-full py-4 text-slate-100">
										<div class="flex items-center gap-2">
											<span
												class="inline-block bg-gradient-to-r from-secondary-900 via-secondary-800 to-secondary-700 bg-clip-text text-2xl text-transparent"
											>
												Attributes
											</span>
										</div>
										<div class="my-4" />

										<AttributesList isDesktop={true} {credential} />
									</div>
								</div>
								{#if showActionButtons}
									<div class="mt-4 flex w-full justify-between gap-6">
										{#if presentationShareURL && presentationShareURL !== ''}
											<CopyFromTextfield
												id="presentationResults"
												name="presentationResults"
												label="Copy the link below to share your creds"
												value={presentationShareURL}
												showCloseIcon={false}
												{handleModal}
											/>
										{:else}
											<Button
												on:click={wrapCredentialShare}
												styles="w-full rounded-xl py-2"
												loading={isLoading}
											>
												<span class="inline-flex items-center">Share</span>
												<Share />
											</Button>
										{/if}
									</div>
								{/if}
							</div>
						</div>
						<div class="mx-4 flex w-1/2 flex-col gap-2 px-4">
							<div>
								<div class="flex items-center justify-end gap-1 py-4">
									<IconButton
										styles="rounded-full from-gray-800 to-gray-800"
										testid="chevron-left"
										disabled={!isMoreToLeft}
									>
										<ChevronLeft styles="justify-center text-focused-blue" />
									</IconButton>

									<IconButton
										styles="rounded-full from-gray-800 to-gray-800"
										testid="chevron-right"
										disabled={!isMoreToRight}
									>
										<ChevronLeft styles="rotate-180 justify-center text-focused-blue" />
									</IconButton>

									<IconButton
										on:click={wrapHandleModal}
										styles="rounded-full from-gray-800 to-gray-800"
										testid="close-modal"
									>
										<Cross styles="justify-center text-gray-100" />
									</IconButton>
								</div>
							</div>
							<div class="flex w-full justify-center">
								<picture>
									<img
										alt=""
										class="w-full rounded-2xl"
										src={credential.appMeta.profilePicture}
										on:error={handleCredentialImageLoadFail}
									/>
								</picture>
							</div>
							<div class="flex w-full flex-col items-center">
								<div class="flex w-full flex-col py-4 text-slate-100">
									<div class="flex items-center justify-between gap-2 px-4">
										<div class="flex flex-row items-center justify-center">
											<span
												class="inline-block bg-gradient-to-r from-secondary-900 via-secondary-800 to-secondary-700 bg-clip-text text-2xl text-transparent"
											>
												Status
											</span>
											{#if presentationResult && presentationResult.vps?.[0].verification_result.valid}
												<Check styles="h-6 w-6 mx-2 fill-green-500 text-white" fill="#191f29" />
											{/if}
										</div>
									</div>
									<VerificationPolicyList
										verificationPolicyResult={presentationResult?.vps?.[0]?.verification_result}
									/>
								</div>
							</div>
							<div class="flex flex-row items-start gap-2">
								{#if showActionButtons}
									<OutlineButton
										on:click={checkPresensationPolicies}
										styles="w-1/2 from-green-500 via-green-500 to-green-500"
										innerStyles="w-full bg-primary-800 text-green-500"
										loading={isCheckStatusLoading}
									>
										Check Status
										<Check styles="h-6 w-6 mx-2 fill-green-500 text-white" fill="#191f29" />
									</OutlineButton>
									<OutlineButton
										loading={isDeleteLoading}
										on:click={() => wrapHandleDeleteCredential(credential.credential.id ?? '')}
										styles="w-1/2 from-primary-error via-primary-error to-primary-error"
										innerStyles="w-full bg-primary-800 text-primary-error"
									>
										Delete
										<Delete />
									</OutlineButton>
								{/if}
							</div>
						</div>
					</div>
				</TransitionChild>
			</div>
		</div>
	</Dialog>
</Transition>
