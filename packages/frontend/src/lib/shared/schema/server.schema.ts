import { z } from 'zod';
import { CredentialRenderMap } from './rendering.schema';

export const UserOnboardingResponseSchema = z.object({
	credentials: CredentialRenderMap.optional(),
	error: z.string().optional(),
});