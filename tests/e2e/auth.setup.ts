import * as dotenv from 'dotenv';
import { STORAGE_STATE_AUTHENTICATED } from './constants';
import { test as setup, expect } from '@playwright/test';

dotenv.config();

setup('Authenticate as user', async ({ page }) => {
	// Perform authentication steps. Replace these actions with your own.
	// Push Log-in button
	await page.goto(`${process.env.APPLICATION_BASE_URL}/swagger`);

	// step 1: click on "Authorize" button
	await page.locator('button.btn.authorize.unlocked:has(span:has-text("Authorize"))').click();

	// step 2: Wait for a modal to pop up
	await page.waitForSelector('div.modal-ux');

	// step 3: find a input and write "TEST_USER_API_KEY"

	await page.fill('div.wrapper section input[type="text"]', process.env.TEST_USER_API_KEY);

	// step 4: click on "Authorize" button
	await page.click('button.btn.modal-btn.auth.authorize.button[aria-label="Apply credentials"][type="submit"]');

	// step 5: assert "Logout" button is visible
	const logOutButton = await page.locator(
		'button.btn.modal-btn.auth.button[aria-label="Remove authorization"]:has-text("Logout")'
	);

	await expect(logOutButton).toBeVisible();

	// Step 5: click on "Close" button
	await page.locator('button.btn.modal-btn.auth.btn-done.button').click();

	// End of authentication steps.

	await page.context().storageState({ path: STORAGE_STATE_AUTHENTICATED });
});
