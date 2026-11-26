import { query } from 'express-validator';

/** A query parameter that must appear once, as a string from a fixed list: a repeated parameter is a 400, not a 500. */
export const singleChoice = (name: string, allowed: readonly (string | number)[], fallback: string) =>
	query(name)
		.optional()
		.custom((value) => typeof value === 'string' && allowed.map(String).includes(value))
		.withMessage(
			`${name} must be given once and be one of: ${allowed.join(', ')}${name === 'range' ? ' (days)' : ''}`
		)
		.bail()
		.default(fallback);
