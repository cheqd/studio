/**
 * A recording stand-in for the Stripe SDK. Any `stripe.<resource>.<method>(...)` call is recorded and answered from
 * a small in-memory ledger, so tests can assert which Stripe object a request touched and who owns it.
 */
export type StripeCall = { path: string; args: unknown[] };

export class StripeLedger {
	calls: StripeCall[] = [];
	/** subscription id -> Stripe customer id */
	subscriptions = new Map<string, string>();
	/** checkout session id -> Stripe customer id */
	sessions = new Map<string, string>();

	reset() {
		this.calls = [];
		this.subscriptions.clear();
		this.sessions.clear();
	}

	callsTo(path: string) {
		return this.calls.filter((c) => c.path === path);
	}

	respond(path: string, args: unknown[]): unknown {
		return { ...(this.respondBody(path, args) as object), lastResponse: { statusCode: 200 } };
	}

	private respondBody(path: string, args: unknown[]): unknown {
		const first = args[0] as any;
		switch (path) {
			case 'subscriptions.retrieve':
			case 'subscriptions.cancel':
			case 'subscriptions.resume':
				return {
					id: first,
					status: 'active',
					customer: this.subscriptions.get(first) ?? 'cus_unknown',
					items: { data: [] },
					metadata: {},
				};
			case 'subscriptions.list': {
				const wanted = first?.customer as string | undefined;
				const data = [...this.subscriptions.entries()]
					.filter(([, customer]) => !wanted || customer === wanted)
					.map(([id, customer]) => ({ id, customer, status: 'active', items: { data: [] }, metadata: {} }));
				return { data, has_more: false };
			}
			case 'checkout.sessions.retrieve':
				return { id: first, customer: this.sessions.get(first) ?? 'cus_unknown', status: 'complete' };
			default:
				return { id: 'stub_id', url: 'http://stripe.invalid/session', data: [], has_more: false };
		}
	}

	build(): unknown {
		const make = (prefix: string[]): any =>
			new Proxy(function () {}, {
				get: (_t, prop: string) => make([...prefix, prop]),
				apply: (_t, _this, args) => {
					const path = prefix.join('.');
					this.calls.push({ path, args });
					const result = Promise.resolve(this.respond(path, args)) as Promise<unknown> & AsyncIterable<never>;
					// Real Stripe list calls are a promise and an async iterable at once. The sync helpers iterate
					// them; yielding nothing keeps them from writing rows, and the recorded call is what tests read.
					if (path.endsWith('.list')) {
						result[Symbol.asyncIterator] = async function* () {
							// no items
						};
					}
					return result;
				},
			});
		return make([]);
	}
}
