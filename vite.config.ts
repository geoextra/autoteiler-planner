import { sentrySvelteKit } from '@sentry/sveltekit';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sentrySvelteKit({
			sourceMapsUploadOptions: {
				org: 'geoextra',
				project: 'autoteiler-planner'
			}
		}),
		tailwindcss(),
		sveltekit()
	],
	ssr: {
		noExternal: ['@googlemaps/js-api-loader']
	},
	build: {
		assetsInlineLimit: Infinity
	}
});
