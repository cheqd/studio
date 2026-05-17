export enum StudioPlanCapability {
	Testnet = 'testnet',
	Mainnet = 'mainnet',
	Faucet = 'faucet',
}

export function getBasicPlanId(): string {
	return process.env.STRIPE_BASIC_PLAN_ID || process.env.STRIPE_TEST_PLAN_ID || '';
}

export function getBuildPlanId(): string {
	return process.env.STRIPE_BUILD_PLAN_ID || '';
}

export function isBasicPlan(productId: string): boolean {
	const basicPlanId = getBasicPlanId();
	return Boolean(basicPlanId && productId === basicPlanId);
}

export function isBuildPlan(productId: string): boolean {
	const buildPlanId = getBuildPlanId();
	return Boolean(buildPlanId && productId === buildPlanId);
}

export function productHasCapability(productId: string, capability: StudioPlanCapability): boolean {
	if (isBuildPlan(productId)) {
		return true;
	}

	if (!isBasicPlan(productId)) {
		return false;
	}

	return capability === StudioPlanCapability.Testnet || capability === StudioPlanCapability.Faucet;
}
