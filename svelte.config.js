import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess({ script: true }),
	kit: {
		adapter: adapter(),
		/* csp: {
			mode: 'hash',
			directives: {
				'script-src': ['self'],
				'style-src': ['self']
			}
		}, */
		output: {
			bundleStrategy: 'inline'
		}
		/* router: {
			type: 'hash'
		} */
	}
};

export default config;
