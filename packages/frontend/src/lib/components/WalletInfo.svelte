<script lang="ts">
	let walletName = '';
	let logoSrc = '';
	let logoClasses = '';

	export { walletName, logoSrc, logoClasses };
</script>

<button
	class="flex items-center justify-between gap-2 rounded-xl bg-primary-900 px-4 py-4 text-gray-200 transition delay-75 duration-300 ease-out hover:bg-gray-800"
>
	{walletName}
	<img alt={walletName + '-wallet'} src={logoSrc} class={logoClasses} />
</button>
