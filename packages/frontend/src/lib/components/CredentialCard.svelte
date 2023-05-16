<svelte:options accessors={true}/>
<script lang="ts">
	import Check from '$lib/icons/Check.svelte';
	import CheckRounded from '$lib/icons/CheckRounded.svelte';
	import Eye from '$lib/icons/Eye.svelte';
	import QuestionMark from '$lib/icons/QuestionMark.svelte';
	import Share from '$lib/icons/Share.svelte';
	import { cachedCredentialsStore, loadingFilters } from '$lib/stores/filteredCredentialsStore';
	import { twMerge } from 'tailwind-merge';
	import Button from './Button.svelte';
	import Checkbox from './Checkbox.svelte';
	import OutlineButton from './OutlineButton.svelte';
	import { createEventDispatcher } from 'svelte';
	import { CredentialTypeSchema, CredentialClaimStatusSchema } from '$shared/schema';
	import type { TupleAsyncSingleCredentialHandlerType, GenericAsyncSingleCredentialHandlerType } from '$lib/client/types';
	import type { CredentialType, CredentialClaimStatusType } from '$shared/types';
	import { DefaultCheqdIssuerLogo } from '$shared/constants';
	import { handleCredentialImageLoadFail } from '$client';
	import Loader from '$icons/Loader.svelte';

	const dispatch = createEventDispatcher();

	const buildCardBaseStyles = (reactiveStatus: CredentialClaimStatusType): string => {
		let baseStyles = twMerge(
			'flex-shrink-0 w-64 flex flex-col justify-around rounded-2xl bg-primary-800 relative hover:-translate-y-1 transition-transform hover:bg-hover-on-credential-card',
			'duration-500'
		);
		if (mode === 'share') {
			baseStyles = 'opacity-50 ' + baseStyles;
			return baseStyles;
		}

		if (reactiveStatus === CredentialClaimStatusSchema.enum.CLAIM_PENDING) {
			baseStyles = 'border-green-600 border ' + baseStyles;
			return baseStyles;
		}

		if (reactiveStatus === CredentialClaimStatusSchema.enum.PENDING_CONFIRMATION) {
			baseStyles = 'border-yellow-600 border ' + baseStyles;
			return baseStyles;
		}

		if (reactiveStatus === CredentialClaimStatusSchema.enum.INELIGIBLE) {
			baseStyles = 'border-red-800 border ' + baseStyles;
			return baseStyles;
		}

		return baseStyles;
	};
	let claimStatus: CredentialClaimStatusType = CredentialClaimStatusSchema.enum.CLAIMED;
	let mode: 'share' | '' = '';
	let handleOnChecked: () => void;
	let isCredentialSelected: boolean;
	let credential: CredentialType;

	$: baseStyles = buildCardBaseStyles(claimStatus);

	// target ref per, DON'T mutate, use top level prop instead
	const { credential: baseCredential, appMeta } = credential;

	let handleCredentialClaim: TupleAsyncSingleCredentialHandlerType;
	let handleCredentialShare: GenericAsyncSingleCredentialHandlerType;

	const wrapCredentialShare = async (credential: CredentialType) => {
		isLoading = true;
		await handleCredentialShare(credential);
		isLoading = false;
	};

	let setActiveCredential: (credential: CredentialType) => Promise<void>;

	const wrapCredentialClaim = async (credential: CredentialType) => {
		isLoading = true;
		const [status, statefulCredential] = await handleCredentialClaim(credential);

		// emit events
		if (status) dispatch('credentialClaimed');
		if (status) dispatch('secretBoxStored');

		// set loading automatically to false, not to display the filter loading modal
		loadingFilters.set(false);

		// update claim status
		claimStatus = statefulCredential.appMeta.status!;

		isLoading = false;
	};

	let isLoading = false;
	let isViewModeOnly = false;
	export {
		claimStatus,
		mode,
		handleOnChecked,
		isCredentialSelected,
		credential,
		handleCredentialClaim,
		handleCredentialShare,
		setActiveCredential,
		isViewModeOnly,
	};

	const getLinkedImage = (src?: string) => {
		if (src && src !== '') {
			return src;
		}

		const subject = baseCredential.credentialSubject;
		switch (appMeta.category) {
			case CredentialTypeSchema.enum.Socials:
				return appMeta.profilePicture;
			case CredentialTypeSchema.enum.Roles:
				return subject.linkedImage ?? appMeta.profilePicture;
			case CredentialTypeSchema.enum.Tickets:
				return subject.linkedImage;
			case CredentialTypeSchema.enum.Events:
				return subject.linkedImage;
			case CredentialTypeSchema.enum.Learn:
				return subject.linkedImage;
			case CredentialTypeSchema.enum.Achievements:
				return subject.linkedImage;
			case CredentialTypeSchema.enum.Endorsement:
				return subject.linkedImage;
		}
	};

	const formatCredentialType = () => {
		const credentialTypeFallback = baseCredential.type
			? baseCredential.type[baseCredential.type.length - 1]
			: (appMeta.category as string);
		let credentialType = appMeta.typeAlias ?? credentialTypeFallback;

		if (credentialType.toLowerCase().includes('cheq')) {
			return credentialType.toLowerCase();
		}
		return credentialType?.charAt(0).toUpperCase() + credentialType?.slice(1);
	};
</script>

<div class="{baseStyles}">
	{#if mode === 'share' && claimStatus == CredentialClaimStatusSchema.enum.CLAIMED}
		<Checkbox
			on:change={handleOnChecked}
			bind:checked={isCredentialSelected}
			styles="absolute top-0 right-0 z-2 mt-7 mr-7 h-7 w-7 rounded-lg"
			testid="share-mode"
		/>
	{/if}
	<div class="p-2">
		<div>
			<picture>
				<img
					alt=""
					class="h-full w-full rounded-2xl"
					src={getLinkedImage()}
					on:error={handleCredentialImageLoadFail}
				/>
			</picture>
		</div>

		<div class="px-6">
			<div class="mb-4 mt-[-2.5rem] flex items-center justify-start gap-4">
				<img
					alt=""
					class="h-16 w-16 self-baseline rounded-full border-2 border-primary-700 bg-white lg:h-20 lg:w-20"
					src={DefaultCheqdIssuerLogo}
				/>
				<div class="mt-12 flex items-center gap-2">
					<span class="text-xs">cheqd</span>
					<Check styles="fill-blue-600" />
				</div>
			</div>
		</div>

		<div class="px-2">
			<h3 class="m-0 p-0 text-base font-normal">
				{formatCredentialType()}
			</h3>
			<p class="mx-0 p-0 py-3 text-xs font-light tracking-tight">
				{appMeta.description ?? ''}
			</p>
		</div>

		{#if isViewModeOnly}
			<!-- show the verified unverified thing -->
			<div class="mx-4 my-4 flex items-center gap-1 text-xs">
				<CheckRounded styles="text-green" />
				<p>Verified</p>
			</div>
			<!--You can check credential verifications(i.e credential signature) -->
		{:else}
			<!-- <div class="my-2 mx-2 flex gap-4 ">
				<div class="flex gap-1">
					<Person />
					<span class="text-white">{1}</span>
				</div>
				<div class="flex gap-1">
					<CreditCard />
					<span class="text-white ">{50}</span>
				</div>
				<div class="flex gap-1">
					<Airplane />
					<span class="text-white">{103}</span>
				</div>
			</div> -->
		{/if}

		{#if isViewModeOnly}
			<div class="w-full p-2">
				<Button
					styles="w-full rounded-xl mb-4"
					on:click={() => {
						setActiveCredential(credential);
					}}
				>
					View
					<Eye />
				</Button>
			</div>
		{:else}
			<div class="my-1 flex w-full items-center justify-between gap-4 p-2">
				{#if claimStatus === CredentialClaimStatusSchema.enum.CLAIMED}
					<Button
						styles="w-full rounded-xl"
						on:click={() => {
							wrapCredentialShare(credential);
						}}
						loading={isLoading}
					>
						Share
						<Share />
					</Button>
					<OutlineButton
						on:click={() => {
							setActiveCredential(credential);
						}}
						styles="w-full rounded-xl"
						innerStyles="w-full bg-primary-800"
					>
						View
						<Eye />
					</OutlineButton>
				{/if}
				{#if claimStatus === CredentialClaimStatusSchema.enum.CLAIM_PENDING}
					<Button
						styles="w-full rounded-xl from-secondary-green-900 via-secondary-green-800 to-secondary-green-700"
						loading={isLoading}
						on:click={() => wrapCredentialClaim(credential)}
					>
						Claim credential
						<CheckRounded styles="fill-white text-green-500" />
					</Button>
				{/if}
				{#if claimStatus === CredentialClaimStatusSchema.enum.INELIGIBLE}
					<Button styles="w-full rounded-xl from-primary-error via-primary-error to-primary-error">
						Not eligible
						<QuestionMark styles="h-6 w-6 fill-white text-red-800" />
					</Button>
				{/if}
				{#if claimStatus === CredentialClaimStatusSchema.enum.PENDING_CONFIRMATION}
					<Button styles="w-full rounded-xl from-primary-warning via-primary-warning to-primary-warning">
						Pending Confirmation
						<Loader styles="h-6 w-6 fill-white text-yellow-800" />
					</Button>
				{/if}
			</div>
		{/if}
	</div>
</div>
