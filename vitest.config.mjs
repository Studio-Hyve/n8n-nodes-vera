import { createRequire } from 'node:module';

import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

export default defineConfig({
	resolve: {
		// n8n-workflow's ESM build uses extensionless imports that Node cannot load directly, and
		// transforming it floods the output with sourcemap notices. Its CommonJS build loads as is.
		alias: { 'n8n-workflow': require.resolve('n8n-workflow') },
	},
	test: {
		include: ['test/**/*.test.ts'],
		environment: 'node',
	},
});
