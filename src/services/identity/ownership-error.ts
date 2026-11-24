/**
 * The one message a caller sees when an identifier, key or other artefact is missing or belongs to someone else.
 * Not found and not yours must look the same (404, same body), so nothing about the artefact is echoed back.
 */
export const NOT_FOUND_MESSAGE = 'Not found';

/**
 * The caller does not own the identifier or key it named (or it does not exist: the two are deliberately
 * indistinguishable). Controllers map this to 404 with `{ error: NOT_FOUND_MESSAGE }`. The message is fixed and
 * never includes the identifier.
 */
export class OwnershipError extends Error {
	constructor() {
		super(NOT_FOUND_MESSAGE);
		this.name = 'OwnershipError';
	}
}
