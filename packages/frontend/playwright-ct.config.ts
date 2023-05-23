import { defineConfig, devices } from '@playwright/experimental-ct-svelte';
import { resolve } from 'node:path';
/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
	testDir: './tests/component',
	use: {
		ctViteConfig: {
			resolve: {
				alias: {
					$lib: resolve('src/lib'),
					$icons: resolve('src/lib/icons'),
					$shared: resolve('src/lib/shared')
				},
			},
		},
		trace: 'retain-on-failure',
	},
	/* Configure projects for major browsers */
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] },
		},
		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] },
		},
	],
});
