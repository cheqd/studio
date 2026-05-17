import {
	getBasicPlanId,
	productHasCapability,
	StudioPlanCapability,
} from '../../../src/services/admin/plan-capabilities.js';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

describe('plan capabilities', () => {
	const originalStripeEnv = {
		STRIPE_BASIC_PLAN_ID: process.env.STRIPE_BASIC_PLAN_ID,
		STRIPE_BUILD_PLAN_ID: process.env.STRIPE_BUILD_PLAN_ID,
		STRIPE_TEST_PLAN_ID: process.env.STRIPE_TEST_PLAN_ID,
	};

	beforeEach(() => {
		process.env.STRIPE_BASIC_PLAN_ID = 'prod_basic';
		process.env.STRIPE_BUILD_PLAN_ID = 'prod_build';
		process.env.STRIPE_TEST_PLAN_ID = 'prod_test';
	});

	afterEach(() => {
		process.env.STRIPE_BASIC_PLAN_ID = originalStripeEnv.STRIPE_BASIC_PLAN_ID;
		process.env.STRIPE_BUILD_PLAN_ID = originalStripeEnv.STRIPE_BUILD_PLAN_ID;
		process.env.STRIPE_TEST_PLAN_ID = originalStripeEnv.STRIPE_TEST_PLAN_ID;
	});

	it('uses STRIPE_BASIC_PLAN_ID before the legacy test plan fallback', () => {
		expect(getBasicPlanId()).toBe('prod_basic');
	});

	it('falls back to STRIPE_TEST_PLAN_ID when basic is not configured', () => {
		delete process.env.STRIPE_BASIC_PLAN_ID;

		expect(getBasicPlanId()).toBe('prod_test');
	});

	it('allows Basic testnet and faucet capabilities only', () => {
		expect(productHasCapability('prod_basic', StudioPlanCapability.Testnet)).toBe(true);
		expect(productHasCapability('prod_basic', StudioPlanCapability.Faucet)).toBe(true);
		expect(productHasCapability('prod_basic', StudioPlanCapability.Mainnet)).toBe(false);
	});

	it('allows legacy Test plan testnet and faucet capabilities during migration', () => {
		expect(productHasCapability('prod_test', StudioPlanCapability.Testnet)).toBe(true);
		expect(productHasCapability('prod_test', StudioPlanCapability.Faucet)).toBe(true);
		expect(productHasCapability('prod_test', StudioPlanCapability.Mainnet)).toBe(false);
	});

	it('allows Build all capabilities', () => {
		expect(productHasCapability('prod_build', StudioPlanCapability.Testnet)).toBe(true);
		expect(productHasCapability('prod_build', StudioPlanCapability.Faucet)).toBe(true);
		expect(productHasCapability('prod_build', StudioPlanCapability.Mainnet)).toBe(true);
	});
});
