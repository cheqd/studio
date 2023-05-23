import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/kit/vite';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter(),
        alias: {
            '$icons': 'src/lib/icons',
            '$components': 'src/lib/components',
            '$shared': 'src/lib/shared',
            '$client': 'src/lib/client',
            '$utils': 'src/lib/utils',
        },
    }
};

export default config;
