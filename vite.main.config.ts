import { defineConfig } from 'vite';
import path from 'node:path';

// https://vitejs.dev/config
export default defineConfig({
	resolve: {
		alias: {
			bufferutil: path.resolve(__dirname, 'src/shims/bufferutil.ts'),
			'utf-8-validate': path.resolve(__dirname, 'src/shims/utf-8-validate.ts'),
		},
	},
});
