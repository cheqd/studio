<script lang="ts">
	import { twMerge } from 'tailwind-merge';

	let styles = '';
	let fill = '';

	export { styles, fill };
</script>

<svg class={twMerge('h-6 w-6', styles)} viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
	<rect x="4" y="6" width="12" height="8" fill={fill ? fill : 'white'} />
	<path
		d="M8.33333 14.1667L5 10.8334L6.175 9.65837L8.33333 11.8084L13.825 6.31671L15 7.50004M10 0.833374L2.5 4.16671V9.16671C2.5 13.7917 5.7 18.1167 10 19.1667C14.3 18.1167 17.5 13.7917 17.5 9.16671V4.16671L10 0.833374Z"
	/>
</svg>
