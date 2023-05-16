<script lang="ts">
	import { twMerge } from 'tailwind-merge';
	export let styles = '';
</script>

<hr class={twMerge('my-0 h-px w-full border-0 bg-gray-500 dark:bg-gray-700', styles)} />
