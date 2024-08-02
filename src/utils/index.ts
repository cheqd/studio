export function getStripeObjectKey(input: string | { id: string } | null) {
	if (!input) {
		return '';
	}

	if (typeof input === 'string') {
		return input;
	}

	return input.id;
}
