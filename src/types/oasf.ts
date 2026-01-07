// Request/Response types for OASF records

import { models } from 'agntcy-dir';

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
	filters_applied?: Record<string, any>;
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
	schema_version?: string;
	description?: string;

	// Identity search
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

export const queryTypeMap: Partial<Record<keyof SearchRecordQuery, models.search_v1.RecordQueryType>> = {
	name: models.search_v1.RecordQueryType.NAME,
	version: models.search_v1.RecordQueryType.VERSION,
	skill: models.search_v1.RecordQueryType.SKILL_NAME,
	domain: models.search_v1.RecordQueryType.DOMAIN_NAME,
	locator: models.search_v1.RecordQueryType.LOCATOR,
	schema_version: models.search_v1.RecordQueryType.SCHEMA_VERSION,
};
