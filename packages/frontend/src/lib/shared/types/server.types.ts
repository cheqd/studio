import type { z } from 'zod';
import type {
    UserOnboardingResponseSchema,
} from '$shared/schema';

export type UserOnboardingResponseType = z.infer<typeof UserOnboardingResponseSchema>;