<script lang="ts">
	import Modal from './Modal.svelte';
	import CopyFromTextfield from './CopyFromTextfield.svelte';
	import type { PresentationResult } from '$shared/types';

	export let presentationResults: PresentationResult;
	export let showModal = true;

	export let handleModal: () => void;
</script>

<Modal {handleModal} openModal={showModal}>
	<div class="flex flex-col gap-4 text-white">
		<div class="flex w-full items-center justify-center">
			<CopyFromTextfield
				{handleModal}
				id="presentationResults"
				name="presentationResults"
				label="Copy the link below to share your creds"
				value={presentationResults.url}
			/>
		</div>
	</div>
</Modal>
