import { CheqdNetwork } from '@cheqd/sdk';
import type { IValidationResult, IValidator, Validatable } from './validator.js';
import { CheqdIdentifierValidator, KeyIdentifierValidator } from './identifier.js';

export class BaseDidValidator implements IValidator {
	validate(did: Validatable): IValidationResult {
		if (typeof did !== 'string') {
			return {
				valid: false,
				error: 'DID should be a string',
			};
		}
		did = did as string;
		if (!did.startsWith('did:')) {
			return {
				valid: false,
				error: 'DID must start with "did:"',
			};
		}
		return { valid: true };
	}
}

export class CheqdDIDValidator extends BaseDidValidator implements IValidator {
	protected identifierValidator: IValidator;
	subject = 'cheqd';

	constructor(identifierValidator?: IValidator) {
		super();
		// Setup default CheqdIdentifierValidator
		if (!identifierValidator) {
			identifierValidator = new CheqdIdentifierValidator();
		}
		this.identifierValidator = identifierValidator;
	}

	public printable(): string {
		return this.subject;
	}

	validate(did: Validatable): IValidationResult {
		// Call base validation
		let _v = super.validate(did);
		if (!_v.valid) {
			return _v;
		}
		did = did as string;
		// Check if DID is cheqd
		const method = did.split(':')[1];
		if (method != this.subject) {
			return {
				valid: false,
				error: 'Cheqd DID should has "cheqd" method name',
			};
		}
		// Check namepsace
		const namespace = did.split(':')[2];
		if (!namespace) {
			return {
				valid: false,
				error: 'Cheqd DID namespace is required',
			};
		}
		// Check if namespace is valid
		if (namespace !== CheqdNetwork.Testnet && namespace !== CheqdNetwork.Mainnet) {
			return {
				valid: false,
				error: `Cheqd DID namespace must be ${CheqdNetwork.Testnet} or ${CheqdNetwork.Mainnet}`,
			};
		}
		// Check identifier
		const id = did.split(':')[3];
		if (!id) {
			return {
				valid: false,
				error: 'Cheqd DID identifier is required',
			};
		}
		// Check that identifier is valid
		_v = this.identifierValidator.validate(id);
		if (!_v.valid) {
			return {
				valid: false,
				error: _v.error,
			};
		}
		return { valid: true };
	}
}

export class KeyDIDValidator extends BaseDidValidator implements IValidator {
	protected identifierValidator: IValidator;
	subject = 'key';

	constructor(identifierValidator?: IValidator) {
		super();
		// Setup default CheqdIdentifierValidator
		if (!identifierValidator) {
			identifierValidator = new KeyIdentifierValidator();
		}
		this.identifierValidator = identifierValidator;
	}

	public printable(): string {
		return this.subject;
	}

	validate(did: Validatable): IValidationResult {
		// Call base validatioin
		let _v = super.validate(did);
		if (!_v.valid) {
			return _v;
		}
		did = did as string;
		// Check if DID is cheqd
		const method = did.split(':')[1];
		if (method != this.subject) {
			return {
				valid: false,
				error: `Key DID should has ${this.subject} method name`,
			};
		}
		// Check identifier
		const id = did.split(':')[2];
		if (!id) {
			return {
				valid: false,
				error: 'Key DID identifier is required',
			};
		}
		// Check that identifier is valid
		_v = this.identifierValidator.validate(id);
		if (!_v.valid) {
			return {
				valid: false,
				error: _v.error,
			};
		}
		return { valid: true };
	}
}

export class DIDValidator implements IValidator {
	protected didValidators: IValidator[];

	constructor(didValidators?: IValidator[]) {
		if (!didValidators) {
			didValidators = [new CheqdDIDValidator(), new KeyDIDValidator()];
		}

		this.didValidators = didValidators;
	}

	validate(did: Validatable): IValidationResult {
		if (typeof did !== 'string') {
			return {
				valid: false,
				error: 'DID should be a string',
			};
		}
		did = did as string;
		const method = did.split(':')[1];
		const validator = this.didValidators.find((v) => v.subject === method);
		if (!validator) {
			return {
				valid: false,
				error: `DID method ${method} is not supported`,
			};
		}
		const _v = validator.validate(did);
		if (!_v.valid) {
			return _v;
		}
		return { valid: true };
	}
}
