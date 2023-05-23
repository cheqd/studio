import type {
	BaseLearnCredentialSchema,
	BaseSSIMasterCredentialSchema,
	LearnCredentialList,
	LearnCredentialSchema,
	LearnCredentialSubjectSchema,
	SSIMasterCredentialList,
	SSIMasterCredentialSchema,
	SSIMasterCredentialSubjectSchema,
} from '$shared/schema';
import type { z } from 'zod';
import type { BaseCredentialType, CredentialType } from './credential.types';

export type LearnCredentialSubjectType = z.infer<typeof LearnCredentialSubjectSchema>;
export type BaseLearnCredentialType = z.infer<typeof BaseLearnCredentialSchema>;
export type LearnCredentialType = z.infer<typeof LearnCredentialSchema>;
export type LearnCredentialListType = z.infer<typeof LearnCredentialList>;

export type SSIMasterCredentialSubjectType = z.infer<typeof SSIMasterCredentialSubjectSchema>;
export type BaseSSIMasterCredentialType = z.infer<typeof BaseSSIMasterCredentialSchema>;
export type SSIMasterCredentialType = z.infer<typeof SSIMasterCredentialSchema>;
export type SSIMasterCredentialListType = z.infer<typeof SSIMasterCredentialList>;

export const isCheq101Credential = (credential: CredentialType): credential is LearnCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return (
		subject &&
		'learn' in subject &&
		subject?.category === 'Learn' &&
		String(subject?.learn?.type).includes('cheqd 101')
	);
};

export const isSSIMasterCredential = (credential: CredentialType): credential is SSIMasterCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return (
		subject &&
		'learn' in subject &&
		subject?.category === 'Learn' &&
		String(subject?.learn?.type).includes('SSI Master')
	);
};

export const isLearnBaseCredential = (
	credential: BaseCredentialType
): credential is LearnCredentialType['credential'] => {
	const subject = credential.credentialSubject;
	return subject && 'learn' in subject && subject?.category === 'Learn';
};
