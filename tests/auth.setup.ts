import { test as setup, expect } from '@playwright/test';
import * as dotenv from 'dotenv';

const userFile = 'playwright/.auth/user.json';

dotenv.config();

setup('Authenticate as user', async ({ page }) => {
    // Perform authentication steps. Replace these actions with your own.
    await page.goto(`${process.env.APPLICATION_BASE_URL}/swagger`);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL(`${process.env.LOGTO_ENDPOINT}/sign-in`, {
		waitUntil: 'domcontentloaded',
	});

    await page.getByPlaceholder('Email / Username').fill(process.env.TEST_USER_EMAIL);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByPlaceholder('Password').fill(process.env.TEST_USER_PASSWORD);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL(`${process.env.APPLICATION_BASE_URL}/swagger/`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
    });
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  
    // End of authentication steps.
  
    await page.context().storageState({ path: userFile });
});
