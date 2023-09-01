import * as dotenv from 'dotenv';
import { chromium } from '@playwright/test';
import type { FullConfig, Browser } from '@playwright/test';

dotenv.config();

async function globalSetup(config: FullConfig) {
    const { storageState } = config.projects[0].use;

    const chromiumBrowser = await chromium.launch();
    await setupPage(chromiumBrowser, storageState as string)
}

async function setupPage(browser: Browser, storageState: string) {
    const page = await browser.newPage();
    await page.goto(`${process.env.APPLICATION_BASE_URL}/logto/sign-in`);
    await page.waitForURL(`${process.env.LOGTO_ENDPOINT}/sign-in`, {
		waitUntil: 'domcontentloaded',
	});

    await page.getByPlaceholder('Email / Username').fill(process.env.TEST_USER_EMAIL);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByPlaceholder('Password').fill(process.env.TEST_USER_PASSWORD);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL(`${process.env.APPLICATION_BASE_URL}/swagger/`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });

    // End of authentication steps.
	await page.context().storageState({ path: storageState });
}

export default globalSetup;
