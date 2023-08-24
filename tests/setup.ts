import { chromium } from '@playwright/test';
import type { FullConfig, Browser } from '@playwright/test';

async function globalSetup(config: FullConfig) {
    const { baseURL, storageState } = config.projects[0].use;

    const chromiumBrowser = await chromium.launch();
    await setupPage(chromiumBrowser, baseURL!, storageState as string)
}

async function setupPage(browser: Browser, baseURL: string, storageState: string) {
    const page = await browser.newPage();
    await page.goto('http://localhost:8787/logto/sign-in');
    await page.waitForURL(`https://service-auth-staging.cheqd.net/sign-in`, {
		waitUntil: 'domcontentloaded',
		timeout: 60000,
	});

    await page.getByPlaceholder('Email / Username').fill('your-email-or-username');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByPlaceholder('Password').fill('your-password');
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.waitForURL('https://service-auth-staging.cheqd.net/sign-in/consent',  {
        waitUntil: 'domcontentloaded',
    });
    await page.waitForURL(`http://localhost:8787/swagger/`, {
        waitUntil: 'domcontentloaded',
    });

    // End of authentication steps.
	await page.context().storageState({ path: storageState });
}

export default globalSetup;
