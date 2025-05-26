import { createHash } from 'crypto';

export function getStripeObjectKey(input: string | { id: string } | null) {
	if (!input) {
		return '';
	}

	if (typeof input === 'string') {
		return input;
	}

	return input.id;
}

export function sha256(input: string): string {
	return createHash('sha256').update(input).digest('hex');
}
