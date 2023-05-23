import type { z } from 'zod';
import type {
    VerificationResultSchema,
    VerificationPolicyResultSchema,
    VerifiablePresentationSchema,
    VerifiablePresentationResultSchema,
    PresentationResultSchema,
    CredpackSchema,
    PresentationResultErrorSchema,
} from '$shared/schema';

export type VerificationPolicyResultType = z.infer<typeof VerificationPolicyResultSchema>;
export type VerificationResultType = z.infer<typeof VerificationResultSchema>;
export type VerifiablePresentationType = z.infer<typeof VerifiablePresentationSchema>;
export type VerifiablePresentationResultType = z.infer<typeof VerifiablePresentationResultSchema>;
export type PresentationResultType = z.infer<typeof PresentationResultSchema>;
export type CredpackType = z.infer<typeof CredpackSchema>;
export type PresentationResultErrorType = z.infer<typeof PresentationResultErrorSchema>;