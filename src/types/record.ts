// Request/Response types for OASF records

export interface UnsuccessfulPublishRecordResponseBody {
	error: string;
}

export interface SearchRecordResponseBody {
	success: true;
	data: PublishRecordRequestBody[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		total_pages: number;
	};
	filters_applied: Record<string, any>;
}

export interface UnsuccessfulSearchRecordResponseBody {
	error: string;
}

export interface GetRecordParams {
	cid: string;
}

export interface GetRecordQuery {
	verify?: boolean | string;
}

export interface GetRecordResponseBody {
	success: true;
	data: PublishRecordRequestBody;
	metadata: {
		cid: string;
		retrieved_at: string;
		verified: boolean | null;
		signature: VerificationResult | null;
	};
}

export interface UnsuccessfulGetRecordResponseBody {
	error: string;
}

/**
 * OASF Record type definition
 */
export interface OASFRecord {
	metadata: {
		version: string;
		uid: string; // ← Identity field!
		product: {
			name: string;
			vendor_name: string;
			version: string;
			lang?: string;
			url?: string;
		};
		labels?: string[];
	};
	record: {
		type_uid: string;
		type_name: string;
		category_uid: string;
		category_name: string;
		class_uid: string;
		class_name: string;
		severity_id: number;
		time: string;
	};
	skills?: Array<{
		skill_id: string;
		skill_name: string;
		confidence?: number;
	}>;
	domains?: Array<{
		domain_id: string;
		domain_name: string;
	}>;
	locators?: Array<{
		type: string;
		url: string;
		description?: string;
	}>;
	modules?: any[];
}


/**
 * Updated interfaces for AGNTCY Directory with identity support
 */

export interface PublishRecordRequestBody {
	data: {
		// Core fields
		name: string;
		version: string;
		schema_version: string;
		
		// Identity field - NEW! ✨
		uid?: string; // DID, OAuth2 client_id, URL, or any unique identifier
		
		// Optional metadata
		description?: string;
		authors?: string[];
		created_at?: string;
		type?: 'agent' | 'organization' | 'service' | 'mcp-server';
		
		// Capabilities
		skills?: Array<{
			name: string;
			id: number;
		}>;
		
		// Deployment info
		locators?: Array<{
			type: string;
			url: string;
			description?: string; // Optional description
		}>;
		
		// Industry/domain
		domains?: Array<{
			name: string;
			id: number;
		}>;
		
		// Extensions
		modules?: any[];
	};
}

export interface PublishRecordResponseBody {
	success: true;
	cid: string;
	message: string;
	data: {
		name: string;
		version: string;
		cid: string;
		published_at: string;
		uid?: string; // Include identity in response
	};
}

/**
 * Search query interface
 */
export interface SearchRecordQuery {
	// Text search
	name?: string;
	version?: string;
	description?: string;
	
	// Identity search - NEW! ✨
	uid?: string; // Search by identity
	
	// Capability search
	skill?: string;
	skill_id?: number;
	domain?: string;
	
	// Deployment search
	locator?: string;
	module?: string;
	type?: 'agent' | 'organization' | 'service' | 'mcp-server';
	
	// Pagination
	page?: number;
	limit?: number;
}

/**
 * Verification result interface
 */
export interface VerificationResult {
	verified: boolean;
	signature?: string;
	signer?: string;
	timestamp?: string;
	error?: string;
}

/**
 * Full OASF record structure (used internally)
 */
export interface OASFRecord {
	metadata: {
		version: string;
		uid: string; // ← IDENTITY FIELD! Can be DID, URL, OAuth2 ID, etc.
		product: {
			name: string;
			vendor_name: string;
			version: string;
			lang?: string;
			url?: string;
		};
		labels?: string[];
	};
	record: {
		type_uid: string;
		type_name: string;
		category_uid: string;
		category_name: string;
		class_uid: string;
		class_name: string;
		severity_id: number;
		time: string;
	};
	skills?: Array<{
		skill_id: string;
		skill_name: string;
		confidence?: number;
	}>;
	domains?: Array<{
		domain_id: string;
		domain_name: string;
	}>;
	locators?: Array<{
		type: string;
		url: string;
		description?: string;
	}>;
	modules?: any[];
	authentication?: {
		methods?: string[];
		did?: string;
		endpoints?: any[];
	};
}

/**
 * Example usage with identity:
 */
export const exampleWithIdentity: PublishRecordRequestBody = {
	data: {
		// Core fields
		name: "Customer Support Agent",
		version: "1.0.0",
		schema_version: "1.0.0",
		
		// Identity - DID from cheqd, Okta, etc.
		uid: "did:cheqd:testnet:7bf81a20-1bfe-4584-9a66-2c4a6b1d5e3f",
		
		// Metadata
		description: "AI agent for customer support queries",
		authors: ["ACME Corp"],
		type: "agent",
		
		// Capabilities
		skills: [
			{ name: "customer_support.query_handling", id: 1 },
			{ name: "e_commerce.order_tracking", id: 2 }
		],
		
		// Deployment
		locators: [
			{
				type: "api_endpoint",
				url: "https://api.acme.com/agents/support"
			},
			{
				type: "did",
				url: "did:cheqd:testnet:7bf81a20-1bfe-4584-9a66-2c4a6b1d5e3f",
				description: "Agent DID"
			},
			{
				type: "badge",
				url: "https://identity.acme.com/v1alpha1/vc/abc123/.well-known/vcs.json",
				description: "Verifiable credential badge"
			}
		],
		
		// Industry
		domains: [
			{ name: "e_commerce", id: 1 },
			{ name: "customer_service", id: 2 }
		]
	}
};

/**
 * Example without identity (fallback to name):
 */
export const exampleWithoutIdentity: PublishRecordRequestBody = {
	data: {
		name: "Simple Agent",
		version: "1.0.0",
		schema_version: "1.0.0",
		// uid is optional - will use name as identifier if not provided
		skills: [
			{ name: "text_generation", id: 1 }
		]
	}
};

/**
 * Type guard to check if record has identity
 */
export function hasIdentity(record: PublishRecordRequestBody): boolean {
	return !!record.data.uid && record.data.uid !== record.data.name;
}

/**
 * Extract identity from record
 */
export function getIdentity(record: PublishRecordRequestBody): string {
	return record.data.uid || record.data.name;
}

/**
 * Check if identity is a DID
 */
export function isDID(uid: string): boolean {
	return uid.startsWith('did:');
}

/**
 * Check if identity is a URL
 */
export function isURL(uid: string): boolean {
	return uid.startsWith('http://') || uid.startsWith('https://');
}

/**
 * Parse identity type
 */
export function getIdentityType(uid: string): 'did' | 'url' | 'oauth2' | 'uuid' | 'name' {
	if (uid.startsWith('did:')) return 'did';
	if (uid.startsWith('http://') || uid.startsWith('https://')) return 'url';
	if (uid.startsWith('urn:uuid:')) return 'uuid';
	if (uid.includes('okta') || uid.includes('auth0') || uid.includes('client')) return 'oauth2';
	return 'name';
}