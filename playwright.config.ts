import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({

  testDir: './dist-tests',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter to use for test results
	// Uses GitHub Actions reporter on CI, otherwise uses HTML reporter
	// Docs: https://playwright.dev/docs/test-reporters
	reporter: process.env.CI ? 'github' : 'html',

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    // Docs: https://playwright.dev/docs/api/class-testoptions#test-options-storage-state
		storageState: '.state.json',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.js/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'],
       // Use prepared auth state.
       storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
  },

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
