import { describe, it, expect } from "@jest/globals";
import { VerificationMethodValidator } from "../../controllers/validator/did_document.js";
import { VALID_CHEQD_DID_INDY, VALID_CHEQD_DID_UUID } from "../constants";
import { VerificationMethods } from "@cheqd/sdk";

const verificationMethodSamples = [
    {
        type: VerificationMethods.Ed255192018,
        publicKeyBase58: "EFTJb1qVRoj2rHwHMz4rnmqXGejUBsmpcfMdVN99KJSD"
    }, 
    {
        type: VerificationMethods.Ed255192020,
        publicKeyMultibase: "z6MkshiMBG5vmMDVxnmz3Z2hdsPX6E1Kbm2BJgGZKe7AEXDb"
    }, 
    {
        type: VerificationMethods.JWK,
        publicKeyJwk: {
            "crv": "Ed25519",
            "kty": "OKP",
            "x": "xNvNcUDxWEcyW-zqabrc-IBLguWYUCAhYwMaOqN2Rqo"
          }
    }
]


for ( const did of [VALID_CHEQD_DID_UUID, VALID_CHEQD_DID_INDY] ) {
    for (const verificationSample of verificationMethodSamples) {
        const verificationMethod = {
            ...verificationSample,
            controller: did,
            id: `${did}#keys-1`
        }
    
    
        describe('isDidDocument. Positive.', () => {
            it(`should return true for valid did document.
                DID: ${did}.
                verificationType: ${verificationMethod.type}`, () => {
                const res = new VerificationMethodValidator().validate(verificationMethod)
                expect(res.valid).toBeTruthy()
                expect(res.error).toBeUndefined()
            })  
        })
    }
}
