import { z } from 'zod';
import { CredpackSchema } from './presentation.schema';

export const ShareUniqueIdentifierSchema = z.string();

export const ShareUniqueUrlSchema = z.string();

export const ShareMetadata = z.object({
    uniqueIdentifier: ShareUniqueIdentifierSchema,
    createdBy: z.string(),
    createdAt: z.date(),
    expiresAt: z.date().optional(),
});

export const ShareUniqueUrlWithMetadataSchema = z.object({
    url: ShareUniqueUrlSchema,
    metadata: ShareMetadata
});

export const ShareCredpackSchema = z.object({
    shareUniqueUrlWithMetadata: ShareUniqueUrlWithMetadataSchema,
    credpack: CredpackSchema
});