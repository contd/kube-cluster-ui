import { defineConfig } from 'vite';
import path from 'node:path';

/** Vite configuration for the Electron main-process bundle. */
export default defineConfig({
	resolve: {
		/** Redirect optional WebSocket accelerators to their JavaScript shims. */
		alias: {
			bufferutil: path.resolve(__dirname, 'src/shims/bufferutil.ts'),
			'utf-8-validate': path.resolve(__dirname, 'src/shims/utf-8-validate.ts'),
		},
	},
});
