<script lang="ts">
	let showSidebar: boolean;
</script>

<div
	class="{showSidebar
		? 'scrollable-without-scrollbar mx-0 mt-0 h-screen overflow-y-auto rounded-none lg:mx-2 lg:my-4 lg:rounded-3xl'
		: ''} prose mx-2 my-4 flex flex-col gap-4 gap-y-4 rounded-3xl bg-primary-800 px-6 py-4 text-white"
>
	<div class="flex w-full flex-col items-start justify-between gap-0">
		<span class="text-xs">Powered by</span>
		<div class="flex w-full items-center justify-start gap-2">
			<img alt="" class="h-14 w-14" src="/waltid-logo.svg" />
			<img alt="" class="h-14 w-14" src="/cheqd-logo.svg" />
		</div>
	</div>
</div>
