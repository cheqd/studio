/** Structure of the record stored on the Verida Network */
export interface DataRecord {
	/** Name/Title of the record, for instance used while browsing the UI. Optional. */
	name?: string;
	/** A summary of the data, could be displayed in the UI. Optional. */
	summary?: string;
	/** The schema of the record, For Credential data, it will be the Credential schema. Required. */
	schema: string;
	/** Any specific attributes of the record. These are following the schema mentioned above. */
	[key: string]: unknown;
}

/** Structure of a Credential record stored on the Verida Network. */
export interface CredentialDataRecord extends DataRecord {
	/** Name is mandatory */
	name: string;
	/** DID JWT of this credential  */
	didJwtVc: string;
	/** Schema of the DID-JWT Verifiable Credential */
	credentialSchema: string;
	/** Data included in the DID-JWT Verifiable Credential */
	credentialData: object;
}
