import { CheqdNetwork } from '@cheqd/sdk';
import type { IValidationResult, IValidator, Validatable } from './validator.js';
import { CheqdIdentifierValidator, KeyIdentifierValidator, VeridaIdentifierValidator } from './identifier.js';
import { EnvironmentType } from '@verida/types';

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
				error: 'Cheqd DID should start with "did:cheqd:" prefix',
			};
		}
		// Check namepsace
		const namespace = did.split(':')[2];
		if (!namespace) {
			return {
				valid: false,
				error: 'Cheqd DID namespace is required ("did:cheqd:mainnet:..." or "did:cheqd:testnet:...")',
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
				error: 'Identifier is required after "did:cheqd:<namespace>:" prefix',
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
				error: 'DID Key should have "did:key:" prefix',
			};
		}
		// Check identifier
		const id = did.split(':')[2];
		if (!id) {
			return {
				valid: false,
				error: 'Identifier is required after "did:key:" prefix',
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

export class VeridaDIDValidator extends BaseDidValidator implements IValidator {
	protected identifierValidator: IValidator;
	subject = 'vda';

	constructor(identifierValidator?: IValidator) {
		super();
		// Setup default CheqdIdentifierValidator
		if (!identifierValidator) {
			identifierValidator = new VeridaIdentifierValidator();
		}
		this.identifierValidator = identifierValidator;
	}

	public printable(): string {
		return this.subject;
	}

	validate(did: Validatable): IValidationResult & { namespace?: EnvironmentType; identifier?: string } {
		// Call base validation
		let _v = super.validate(did);
		if (!_v.valid) {
			return _v;
		}
		did = did as string;
		// Check if DID is vda
		const method = did.split(':')[1];
		if (method != this.subject) {
			return {
				valid: false,
				error: 'DID Verida should have "did:vda:" prefix',
			};
		}

		// Check namepsace
		const namespace = did.split(':')[2] as EnvironmentType | undefined;
		if (!namespace) {
			return {
				valid: false,
				error: 'Verida DID namespace is required ("did:vda:mainnet:..." or "did:vda:testnet:...")',
			};
		}

		// Check if namespace is valid
		if (!(namespace in EnvironmentType)) {
			return {
				valid: false,
				error: `Verida DID namespace must be ${EnvironmentType.MAINNET} or ${EnvironmentType.TESTNET}`,
			};
		}

		// Check identifier
		const identifier = did.split(':')[3];
		if (!identifier) {
			return {
				valid: false,
				error: 'Identifier is required after "did:vda:<namespace>:" prefix',
			};
		}
		// Check that identifier is valid
		_v = this.identifierValidator.validate(identifier);
		if (!_v.valid) {
			return {
				valid: false,
				error: _v.error,
			};
		}
		return { valid: true, namespace, identifier };
	}
}

export class DIDValidator implements IValidator {
	protected didValidators: IValidator[];

	constructor(didValidators?: IValidator[]) {
		if (!didValidators) {
			didValidators = [new CheqdDIDValidator(), new KeyDIDValidator(), new VeridaDIDValidator()];
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
		if (!did.startsWith('did:')) {
			return {
				valid: false,
				error: 'Invalid format of DID. Expected to start with did:<method>',
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
