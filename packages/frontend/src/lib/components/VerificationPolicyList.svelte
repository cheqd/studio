<script lang="ts">
	import CheckRounded from '$lib/icons/CheckRounded.svelte';
	import TooltipIcon from '$lib/icons/TooltipIcon.svelte';
	import Cross from '$lib/icons/Cross.svelte';
	import type { VerificationPolicyResult } from '$shared/types';

	export let verificationPolicyResult: VerificationPolicyResult = {
		policyResults: {
			SignaturePolicy: false,
			ChallengePolicy: false,
			PresentationDefinitionPolicy: false,
		},
		valid: false,
	};
	export let isMobile: boolean = false;
</script>

<div class={isMobile ? 'text-xs text-slate-100 lg:py-4' : 'text-slate-100 lg:py-4'}>
	<div class="min-w-max rounded-xl bg-gray-800">
		{#if !verificationPolicyResult}
			<div>
				<div class="flex items-center justify-start gap-2 px-4 py-2">
					<TooltipIcon styles="text-gray-400" />
					<span>Signature policy: </span>

					<span class="text-slate-500">Unverified</span>
					<Cross styles="text-slate-500" />
				</div>
				<div class="flex items-center justify-start gap-2 px-4 py-2">
					<TooltipIcon styles="text-gray-400" />
					<span>Challenge policy: </span>

					<span class="text-slate-500">Unverified</span>
					<Cross styles="text-slate-500" />
				</div>
				<div class="flex items-center justify-start gap-2 px-4 py-2">
					<TooltipIcon styles="text-gray-400" />
					<span>JSON schema policy: </span>

					<span class="text-slate-500">Unverified</span>
					<Cross styles="text-slate-500" />
				</div>
				<div class="flex items-center justify-start gap-2 px-4 py-2">
					<TooltipIcon styles="text-gray-400" />
					<span>Presentation policy: </span>

					<span class="text-slate-500">Unverified</span>
					<Cross styles="text-slate-500" />
				</div>
			</div>
		{:else}
			<div class="flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />
				<span>Signature policy</span>

				{#if verificationPolicyResult.policyResults.SignaturePolicy && verificationPolicyResult.valid}
					<span class="text-green-400">Verified</span>
					<CheckRounded styles="text-green-500" mini />
				{/if}
			</div>
			<div class="flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />
				<span>Challenge policy</span>
				{#if verificationPolicyResult.policyResults.ChallengePolicy && verificationPolicyResult.valid}
					<span class="text-green-400">Verified</span>
					<CheckRounded styles="text-green-500" mini />
				{/if}
			</div>
			<div class="flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />
				<span>JSON schema policy</span>
				{#if verificationPolicyResult.policyResults.ChallengePolicy && verificationPolicyResult.valid}
					<span class="text-green-400">Verified</span>
					<CheckRounded styles="text-green-500" mini />
				{/if}
			</div>
			<div class="flex items-center justify-start gap-2 px-4 py-2">
				<TooltipIcon styles="text-gray-400" />
				<span>Presentation policy</span>
				{#if verificationPolicyResult.policyResults.PresentationDefinitionPolicy && verificationPolicyResult.valid}
					<span class="text-green-400">Verified</span>
					<CheckRounded styles="text-green-500" mini />
				{/if}
			</div>
		{/if}
	</div>
</div>
