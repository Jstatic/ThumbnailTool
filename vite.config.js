import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		port: 5172,
		open: true,
		allowedHosts: ['5172--dev--jleonard--jleonard.devspaces.rbx.com']
	},
	build: {
		outDir: 'dist',
		assetsDir: 'assets',
		rollupOptions: {
			input: {
				main: './index.html'
			}
		}
	}
});

