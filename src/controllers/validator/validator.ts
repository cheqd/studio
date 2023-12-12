import type { W3CVerifiableCredential, W3CVerifiablePresentation } from "@veramo/core";
import type { DIDDocument, VerificationMethod } from "did-resolver";
import type { IHelpers } from "./helpers";

export type Validatable = string | string[] | DIDDocument | W3CVerifiableCredential | W3CVerifiablePresentation | VerificationMethod | VerificationMethod[];

export interface IValidator {
    // in case of failure - raise an error, it's totally fine
    validate(value: Validatable): IValidationResult;
    printable?(): string;
    // What is the subject of validation
    subject?: string;
    helpers?: IHelpers;
}

export interface IValidationResult {
    valid: boolean;
    error?: string;

}
