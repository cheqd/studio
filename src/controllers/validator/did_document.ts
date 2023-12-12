import { DIDDocument, validateSpecCompliantPayload } from "@cheqd/sdk";
import { CheqdControllerValidator, DIDValidator } from "./did.js";
import type { IValidationResult, IValidator, Validatable } from "./validator.js";
import { VerificationMethodValidator } from "./verification_method.js";

export class DIDDocumentValidator implements IValidator {
    protected didValidator: IValidator;
    protected controllerValidator: IValidator;
    protected verificationMethodValidator: IValidator;

    constructor(
        didValidator?: IValidator, 
        controllerValidator?: IValidator, 
        verificationMethodValidator?: IValidator) {
        if (!didValidator) {
            didValidator = new DIDValidator();
        }
        if (!controllerValidator) {
            controllerValidator = new CheqdControllerValidator();
        }

        if (!verificationMethodValidator) {
            verificationMethodValidator = new VerificationMethodValidator();
        }
        this.didValidator = didValidator;
        this.controllerValidator = controllerValidator;
        this.verificationMethodValidator = verificationMethodValidator;
    }

    validate(didDocument: Validatable): IValidationResult {
        didDocument = didDocument as DIDDocument;
        // Check spec compliance
        const _spec = validateSpecCompliantPayload(didDocument);
        if (!_spec.valid) {
            return {
                valid: false,
                error: _spec.error
            };
        }
        // Check id (id of DIDDocument must be valid DID)
        let _v = this.didValidator?.validate(didDocument.id);
        if (!_v?.valid) {
            return {
                valid: false,
                error: _v?.error
            };
        }
        // Check controller
        if (didDocument.controller) {
            _v = this.controllerValidator?.validate(didDocument.controller);
            if (!_v?.valid) {
                return {
                    valid: false,
                    error: _v?.error
                };
            }
        }
        // Check verification methods
        if (didDocument.verificationMethod) {
            _v = this.verificationMethodValidator.validate(didDocument.verificationMethod);
            if (!_v?.valid) {
                return {
                    valid: false,
                    error: _v?.error
                };
            }
        
        }
        return { valid : true }
    }
}