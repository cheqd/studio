import { z } from 'zod';
import { CredentialSchemaList, CredentialTypeSchema } from './credential.schema';

export const CredentialListRenderSchema = z.object({
    credentials: CredentialSchemaList,
    claimedCount: z.number().default(0),
    claimPendingCount: z.number().default(0),
    claimIneligibleCount: z.number().default(0),
});

export const CredentialRenderMap = z.map(CredentialTypeSchema, CredentialListRenderSchema);
