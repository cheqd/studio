module.exports = {
	plugins: {
		tailwindcss: {},
		autoprefixer: {},
        ...(process.env.CF_PAGES ? { cssnano: {} } : {}),
	}
};
