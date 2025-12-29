import { defineConfig } from 'vite'

export default defineConfig({
	root: '.',
	publicDir: 'public',
	// Use the repository name as the base path for GitHub Pages so
	// assets resolve correctly at https://<user>.github.io/<repo>/...
	base: '/slopmine/',
	build: {
		outDir: 'dist',
	},
})
