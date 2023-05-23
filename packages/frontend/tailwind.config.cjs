/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				'primary-200': '#3DB8D2',
				'primary-500': '#0E5BD1',
				'primary-700': '#44587E',
				'primary-800': '#191E28',
				'primary-900': '#0C0E12',
				'secondary-700': '#3DB8D2',
				'secondary-800': '#2589D2',
				'secondary-900': '#0D59D1',
				'focused-blue': '#0D59D1',
				'secondary-green-900': '#30AF3D',
				'secondary-green-700': '#3DBD4B',
				'secondary-green-800': '#4BCB58',
				'primary-error': '#A53939',
				'nav-bar-bg': '#161c25',
				'hover-on-credential-card': '#1b263b'
			},
		},
	},
	plugins: [require('@tailwindcss/typography')],
};
