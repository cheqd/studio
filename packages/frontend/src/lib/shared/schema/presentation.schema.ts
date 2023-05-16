import { z } from 'zod';
import { BaseCredentialSchema } from './credential.schema';

export const VerificationPolicyResultSchema = z.object({
    SignaturePolicy: z.boolean(),
    ChallengePolicy: z.boolean(),
    PresentationDefinitionPolicy: z.boolean()
});

export const VerificationResultSchema = z.object({
    valid: z.boolean(),
    policyResults: VerificationPolicyResultSchema
});

export const VerifiablePresentationSchema = z.object({
    type: z.array(z.string()),
    '@context': z.array(z.string()),
    id: z.string(),
    holder: z.string(),
    verifiableCredential: z.array(z.string())
});

export const VerifiablePresentationResultSchema = z.object({
    vcs: z.array(BaseCredentialSchema),
    verification_result: VerificationResultSchema,
    vp: VerifiablePresentationSchema
});

export const PresentationResultSchema = z.object({
    auth_token: z.string().optional(),
    isValid: z.boolean().optional(),
    state: z.string().optional(),
    subject: z.string().optional(),
    vps: z.array(VerifiablePresentationResultSchema).optional()
})

export const CredpackSchema = z.object({
    verifiablePresentation: z.object({
        verificationResult: VerificationResultSchema,
        vp: VerifiablePresentationSchema
    })
});

export const PresentationResultErrorSchema = z.object({
    error: z.string()
});