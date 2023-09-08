import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  // Directory where all tests are located
  testDir: './tests',

  // Start local dev server before starting the tests
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
  
  // Shared settings for all the projects below.
  // Docs: https://playwright.dev/docs/api/class-testoptions
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: 'http://localhost:3000',

    // Storage state to use for the context
    // Docs: https://playwright.dev/docs/api/class-testoptions#test-options-storage-state
		storageState: '.state.json',

    // Set whether to record traces
		// Docs: https://playwright.dev/docs/api/class-testoptions#test-options-trace
		trace: 'retain-on-failure',

    // Set whether to record screenshots
		// Docs: https://playwright.dev/docs/api/class-testoptions#test-options-screenshot
		screenshot: 'off',

    // Set whether to record videos
		// Docs: https://playwright.dev/docs/api/class-testoptions#test-options-video
		video: 'off',
  },

  // Reporter to use for test results
	// Uses GitHub Actions reporter on CI, otherwise uses HTML reporter
	// Docs: https://playwright.dev/docs/test-reporters
	reporter: process.env.CI ? 'github' : 'html',

  // Fail the build on CI if you accidentally left test.only in the source code
	// Docs: https://playwright.dev/docs/api/class-testconfig#test-config-forbid-only
  forbidOnly: !!process.env.CI,
  
  // The maximum number of retry attempts given to failed tests
	// Docs: https://playwright.dev/docs/api/class-testconfig#test-config-retries
  retries: process.env.CI ? 2 : 0,

  // Whether to run tests in parallel
  // Docs: https://playwright.dev/docs/api/class-testconfig#test-config-fully-parallel
  fullyParallel: false,
  
  // Number of parallel workers OR %age of logical CPUs to use
	// Github Actions runners have 2 logical CPU cores
  // Defaults to half of the logical CPU cores available
	// Docs: https://playwright.dev/docs/api/class-testconfig#test-config-workers
	workers: process.env.CI ? 2 : undefined,

  // Limit the numbers of failures to set a fail-fast strategy on CI
  // Docs: https://playwright.dev/docs/api/class-testconfig#test-config-max-failures
  maxFailures: process.env.CI ? 10 : undefined,

  // Configure project specific settings
  // Docs: https://playwright.dev/docs/test-projects
  projects: [
    { 
      name: 'setup',
      testMatch: /.*\.setup\.js/
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use prepared auth state.
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Timeout for each test in milliseconds
	// 120,000ms = 2 minutes
	// Docs: https://playwright.dev/docs/test-timeouts
	timeout: 60 * 1000,

	// Timeout for each expect/assertion in milliseconds
	// 20,000ms = 20 seconds
	// Docs: https://playwright.dev/docs/test-timeouts
	expect: {
		timeout: 20 * 1000,
	},

	// Global timeout for overall test run in milliseconds
	// By default, Playwright has no global timeout but suggests a "sensible limit" can be set if needed
	// 1,500,000ms = 25 minutes
	// Docs: https://playwright.dev/docs/test-timeouts#global-timeout
	globalTimeout: 25 * 60 * 1000,
});
