import type { z } from 'zod';
import type {
	S3UploadResponseErrorSchema,
	S3UploadShareResponseSchema,
	S3UploadResponseSchema,
	S3GetResponseSchema,
	CredentialContentSchema,
	KeyPairContentSchema,
	DidMethodSchema,
	PeerTypeSchema,
	DidUrlSchema,
	DidNamespaceSchema,
	PeerContentSchema,
	KeyContentSchema,
	UnwrappedBlobSchema,
	EncryptedStorageRequestBodySchema,
	EncryptedStorageResponseBodySchema,
} from '$shared/schema';

export type S3UploadResponseErrorType = z.infer<typeof S3UploadResponseErrorSchema>;
export type S3UploadShareResponseType = z.infer<typeof S3UploadShareResponseSchema>;
export type S3UploadResponseType = z.infer<typeof S3UploadResponseSchema>;
export type S3GetResponseType = z.infer<typeof S3GetResponseSchema>;
export type EncryptedStorageRequestBodyType = z.infer<typeof EncryptedStorageRequestBodySchema>;
export type EncryptedStorageResponseBodyType = z.infer<typeof EncryptedStorageResponseBodySchema>;
export type CredentialContentType = z.infer<typeof CredentialContentSchema>;
export type KeyPairContentType = z.infer<typeof KeyPairContentSchema>;
export type DidMethodSchema = z.infer<typeof DidMethodSchema>;
export type PeerTypeSchema = z.infer<typeof PeerTypeSchema>;
export type DidUrlSchema = z.infer<typeof DidUrlSchema>;
export type DidNamespaceSchema = z.infer<typeof DidNamespaceSchema>;
export type PeerContentType = z.infer<typeof PeerContentSchema>;
export type KeyContentType = z.infer<typeof KeyContentSchema>;
export type UnwrappedBlobType = z.infer<typeof UnwrappedBlobSchema>;
