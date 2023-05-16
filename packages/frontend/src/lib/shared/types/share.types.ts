import type { z } from 'zod';
import type {
    ShareUniqueIdentifierSchema,
    ShareUniqueUrlSchema,
    ShareMetadata,
    ShareUniqueUrlWithMetadataSchema,
    ShareCredpackSchema,
} from '$shared/schema';

export type ShareUniqueIdentifierType = z.infer<typeof ShareUniqueIdentifierSchema>;
export type ShareUniqueUrlType = z.infer<typeof ShareUniqueUrlSchema>;
export type ShareMetadataType = z.infer<typeof ShareMetadata>;
export type ShareUniqueUrlWithMetadataType = z.infer<typeof ShareUniqueUrlWithMetadataSchema>;
export type ShareCredpackType = z.infer<typeof ShareCredpackSchema>;