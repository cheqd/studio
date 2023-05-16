import { z } from 'zod';
import {
    BaseCredentialSchema,
    CredentialApplicationMetadataSchema
} from '$shared/schema';
import type {
    PutObjectCommandOutput,
    HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';

export const S3UploadResponseSchema: z.ZodType<
	{ result: Pick<PutObjectCommandOutput, 'ETag' | 'Expiration' | 'ChecksumSHA256' | 'VersionId'> & Pick<HeadObjectCommandOutput, "LastModified"> & { Location: string } } & { success: boolean }
> = z
	.object({
		result: z.object({
			ETag: z.string(),
			Location: z.string(),
			LastModified: z.date(),
			Expiration: z.string(),
			ChecksumSHA256: z.string(),
			VersionId: z.string(),
		}),
	})
	.extend({
		success: z.boolean(),
	});

export const S3GetResponseSchema = z.object({
    success: z.boolean(),
    result: z.string(),
    error: z.unknown().optional(),
});

export const S3UploadShareResponseSchema: z.ZodType<
    Pick<PutObjectCommandOutput, 'ETag' | 'Expiration' | 'ChecksumSHA256' | 'VersionId'> & { success: boolean}
> = z
    .object({
        ETag: z.string(),
        Expiration: z.string(),
        ChecksumSHA256: z.string(),
        VersionId: z.string(),
    })
    .extend({
        success: z.boolean(),
    });

export const S3UploadResponseErrorSchema = z.object({
	success: z.boolean(),
	error: z.unknown(),
});

export const EncryptedStorageRequestBodySchema = z.object({
    encryptedDataWithMetadata: z.string(),
    keySet: z.object({
        publicKey: z.string(),
    }),
});

export const EncryptedStorageResponseBodySchema = z.object({
    success: z.boolean(),
    result: S3UploadResponseSchema,
});

export const CredentialContentSchema = z.object({
    claimed: z.array(BaseCredentialSchema),
    unclaimed: z.array(CredentialApplicationMetadataSchema.pick({ internalCredentialId: true })),
});

export const KeyPairContentSchema = z.object({
    publicKey: z.string(),
    privateKey: z.string(),
});

export const DidMethodSchema = z.union([z.literal('cheqd'), z.literal('key'), z.literal('web')]);

export const PeerTypeSchema = z.union([z.literal('issuer'), z.literal('holder'), z.literal('verifier')]);

export const DidUrlSchema = z.union([
    z.string().regex(/^did:cheqd:[a-zA-Z]+:[a-zA-Z0-9-]+$/),
    z.string().regex(/^did:key:[a-zA-Z0-9]+$/),
    z.string().regex(/^did:web:[a-zA-Z0-9]+$/),
]);

export const DidNamespaceSchema = z.string();

export const PeerContentSchema = z.object({
    method: DidMethodSchema,
    name: z.string(),
    type: PeerTypeSchema,
    did: DidUrlSchema,
});

export const KeyContentSchema = z.object({
    name: z.string(),
    keyPair: KeyPairContentSchema,
    peer: PeerContentSchema,
});

export const UnwrappedBlobSchema = z.object({
    credentials: CredentialContentSchema,
    keys: z.array(KeyContentSchema).optional(),
});