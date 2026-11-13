/**
 * The caller does not own the identifier or key it named (or it does not exist: the two are deliberately
 * indistinguishable). Controllers map this to 403. The message keeps the `<did> not found in wallet` wording.
 */
export class OwnershipError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'OwnershipError';
	}
}
