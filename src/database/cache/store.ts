import NodeCache from 'node-cache';
import * as dotenv from 'dotenv';

import { PaymentAccountEntity } from '../entities/payment.account.entity.js';

dotenv.config();

/** The parts of a Stripe subscription that the faucet endpoint needs, as last read from Stripe. */
export interface SubscriptionPlanSnapshot {
	status: string;
	productId: string;
}

let { LOCAL_STORE_TTL = 600 } = process.env;

export class LocalStore {
	private cache: NodeCache;

	public static instance = new LocalStore();

	constructor() {
		this.cache = new NodeCache();
	}

	setCustomerAccounts(key: string, data: PaymentAccountEntity[]) {
		this.cache.set(key, data, +LOCAL_STORE_TTL);
	}

	getCustomerAccounts(key: string) {
		return this.cache.get(key) as PaymentAccountEntity[] | undefined;
	}

	setSubscriptionPlan(subscriptionId: string, plan: SubscriptionPlanSnapshot, ttlSeconds: number) {
		this.cache.set(`subscription-plan:${subscriptionId}`, plan, ttlSeconds);
	}

	getSubscriptionPlan(subscriptionId: string) {
		return this.cache.get(`subscription-plan:${subscriptionId}`) as SubscriptionPlanSnapshot | undefined;
	}
}
