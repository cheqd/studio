/**
 * Masks an email address for staff screens: the first character of the local part, `•••`, then the domain
 * (`alice@example.com` becomes `a•••@example.com`). A value with no usable `@` keeps only its first character.
 * Staff see the full address only through `POST /admin/customers/{id}/email-reveal`, which is audited.
 */
export function maskEmail(value: string | null | undefined): string {
	if (!value) return '';
	const at = value.lastIndexOf('@');
	if (at <= 0) return `${value[0]}•••`;
	return `${value[0]}•••@${value.slice(at + 1)}`;
}

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+$/;

/** Masks a display value only when it is an email address (a customer's name is often its email). */
export function maskIfEmail(value: string | null | undefined): string {
	if (!value) return value ?? '';
	return EMAIL_LIKE.test(value.trim()) ? maskEmail(value.trim()) : value;
}
