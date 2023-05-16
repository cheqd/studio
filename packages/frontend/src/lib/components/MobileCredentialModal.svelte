<script lang="ts">
	import Check from '$lib/icons/Check.svelte';
	import ChevronLeft from '$lib/icons/ChevronLeft.svelte';
	import Cross from '$lib/icons/Cross.svelte';
	import Delete from '$lib/icons/Delete.svelte';
	import Share from '$lib/icons/Share.svelte';
	import type { CredentialType, CredentialPresentationRequest, PresentationResult } from '$shared/types';
	import { Transition, TransitionChild, Dialog, DialogTitle } from '@rgossiaux/svelte-headlessui';
	import AttributesList from './AttributesList.svelte';
	import Button from './Button.svelte';
	import HorizontalRule from './HorizontalRule.svelte';
	import IconButton from './IconButton.svelte';
	import OutlineButton from './OutlineButton.svelte';
	import VerificationPolicyList from './VerificationPolicyList.svelte';
	import type { GenericAsyncVoidFuctionType } from '$lib/client/types';
	import { DefaultCheqdIssuerLogo } from '$shared/constants';
	import { handleCredentialImageLoadFail } from '$client';
	import PresentationResultsModal from './PresentationResultsModal.svelte';

	let visible = true;
	const handleClick = () => {
		visible = !visible;
	};
	let openModal = false;
	let handleModal: () => void;

	let showActionButtons = true;

	let presentationResult: PresentationResult | null;
	let showCredentialPresentationResultModal: boolean = false;

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
				showCredentialPresentationResultModal = true;
				presentationShareURL = presentationResult.url;

				return;
			}

			console.log('error in presentation: ', data);
		}
	};
	let isLoading = false;
	let credential: CredentialType;

	let handleDeleteCredential: GenericAsyncVoidFuctionType;
	export { credential, handleModal, openModal, showActionButtons, handleDeleteCredential };

	const wrapCredentialShare = async () => {
		isLoading = true;
		await shareCredential(credential);
		isLoading = false;
	};

	const wrapHandleModal = () => {
		presentationResult = null;
		presentationShareURL = '';
		handleModal();
	};

	let isCheckStatusLoading = false;
	const checkPresensationPolicies = async () => {
		isCheckStatusLoading = true;
		await shareCredential(credential);
		isCheckStatusLoading = false;
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
	<Dialog as="div" class="relative z-10" open={openModal} on:close={() => (openModal = false)}>
		<TransitionChild
			enter="ease-out duration-200"
			enterFrom="opacity-0"
			enterTo="opacity-70"
			leave="ease-in duration-50"
			leaveFrom="opacity-100"
			leaveTo="opacity-0"
		>
			<div class="fixed inset-0 bg-gray-700 bg-opacity-40" />
		</TransitionChild>

		<div class="fixed inset-0 overflow-y-auto">
			<div class="flex min-h-full items-center justify-center p-2 text-center">
				<TransitionChild
					enter="ease-out duration-300"
					enterFrom="opacity-0 scale-95"
					enterTo="opacity-100 scale-100"
					leave="ease-in duration-200"
					leaveFrom="opacity-100 scale-100"
					leaveTo="opacity-0 scale-95"
				>
					<div
						class="flex h-full w-full transform flex-col overflow-hidden rounded-2xl bg-primary-800 p-2 text-left align-middle shadow-xl transition-all"
					>
						<div class="flex flex-col">
							<DialogTitle as="div" class=" flex flex-col text-lg font-bold leading-6 text-white">
								<div class="flex flex-col items-center">
									<IconButton
										on:click={() => {
											wrapHandleModal();
										}}
										styles="fixed top-0 right-0 rounded-full from-gray-800 to-gray-800 mt-5 mr-5"
									>
										<Cross styles="justify-center  text-gray-100" />
									</IconButton>
									<picture>
										<img
											alt=""
											class=" rounded-2xl"
											src={credential.appMeta.profilePicture}
											on:error={handleCredentialImageLoadFail}
										/>
									</picture>
									<div class="flex w-full justify-center">
										<div class=" fixed -mt-10 rounded-full border-4 border-primary-800 bg-white">
											<picture>
												<img
													alt=""
													class="h-20 w-20 rounded-full"
													src={DefaultCheqdIssuerLogo}
												/>
											</picture>
										</div>
									</div>
									<div class="mt-14 flex flex-col gap-2">
										<div class="flex flex-col">
											<h1 class="text-3xl">{credential?.appMeta?.typeAlias}</h1>
											<span class="flex items-center justify-center gap-2 text-sm text-gray-400">
												issued by
												<span class="flex items-center justify-start gap-2 text-lg text-white">
													cheqd
													<Check styles="fill-blue-400 text-white" />
												</span>
											</span>
										</div>
										<!-- <div class="my-2 flex justify-center gap-4">
											<div class="flex gap-1">
												<Person styles="fill-blue-500 stroke-blue-500" />
												<label class="text-white">{1}</label>
											</div>
											<div class="flex gap-1">
												<CreditCard styles="fill-blue-500 stroke-blue-500" />
												<label class="text-white ">{50}</label>
											</div>
											<div class="flex gap-1">
												<Airplane styles="fill-blue-500 stroke-blue-500" />
												<label class="text-white">{103}</label>
											</div>
										</div> -->
									</div>
									<div class="my-8">
										<p class="text-sm text-gray-200">
											{credential?.appMeta?.description}
										</p>
									</div>
								</div>
							</DialogTitle>
							<!-- Left and Right buttons -->
							<IconButton styles="fixed left-0 top-1/2 rounded-full  bg-gray-800">
								<ChevronLeft styles="justify-center text-focused-blue" />
							</IconButton>
							<IconButton styles="fixed right-0 top-1/2 rounded-full bg-gray-800">
								<ChevronLeft styles="rotate-180 justify-center text-focused-blue" />
							</IconButton>

							<div class="flex h-full flex-col justify-between">
								<div>
									<div class="py-4 text-slate-100">
										<div class="flex justify-between px-2">
											<div
												class="flex items-center justify-center gap-1"
												on:keydown={handleClick}
												on:click={handleClick}
											>
												<span class="py-4">Attributes</span>
											</div>
											<div
												class="flex items-center gap-1"
												on:keydown={handleClick}
												on:click={handleClick}
											>
												{#if presentationResult && presentationResult.vps?.[0].verification_result.valid}
													<Check
														styles="justify-center fill-green-500 text-white"
														fill="#191f29"
													/>
												{/if}
												<span class="py-4">Verification Profile</span>
											</div>
										</div>
										<div class="mb-6 mt-2 flex">
											<HorizontalRule
												styles={visible
													? 'bg-gradient-to-r from-secondary-900 via-secondary-800 to-secondary-700 h-1 rounded-sm'
													: ''}
											/>
											<HorizontalRule
												styles={visible
													? ''
													: 'bg-gradient-to-r from-secondary-900 via-secondary-800 to-secondary-700 h-1 rounded-sm'}
											/>
										</div>
										{#if visible}
											<AttributesList isMobile={true} {credential} />
										{:else if !visible}
											<VerificationPolicyList
												verificationPolicyResult={presentationResult?.vps?.[0]
													?.verification_result}
												isMobile={true}
											/>
										{/if}
									</div>
								</div>
								{#if showActionButtons}
									<div class="mt-4 flex w-full justify-between gap-2">
										<Button
											on:click={wrapCredentialShare}
											styles="w-1/2 rounded-md py-2"
											loading={isLoading}
										>
											<span class="inline-flex items-center">Share</span>
											<Share />
										</Button>

										{#if visible}
											<OutlineButton
												loading={isDeleteLoading}
												on:click={() =>
													wrapHandleDeleteCredential(credential?.credential?.id ?? '')}
												styles="w-1/2 from-primary-error via-primary-error to-primary-error"
												innerStyles="w-full bg-primary-800 text-primary-error"
											>
												Delete
												<Delete />
											</OutlineButton>
										{:else}
											<OutlineButton
												on:click={checkPresensationPolicies}
												styles="w-1/2 from-green-500 via-green-500 to-green-500"
												innerStyles="w-full bg-primary-800 text-green-500"
												loading={isCheckStatusLoading}
											>
												Check Status
												<Check styles="fill-green-500" fill="#191f29" />
											</OutlineButton>
										{/if}
									</div>
								{/if}
							</div>
						</div>
						{#if presentationShareURL && presentationShareURL !== ''}
							<PresentationResultsModal
								presentationResults={presentationResult}
								showModal={showCredentialPresentationResultModal}
								handleModal={() => {
									showCredentialPresentationResultModal = !showCredentialPresentationResultModal;
								}}
							/>
						{/if}
					</div>
				</TransitionChild>
			</div>
		</div>
	</Dialog>
</Transition>
