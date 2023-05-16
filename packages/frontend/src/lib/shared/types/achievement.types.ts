import type {
	AchievementCredentialData,
	AchievementCredentialList,
	AchievementCredentialSchema,
	AchievementCredentialSubjectSchema,
	AchievementVoucher,
} from '$shared/schema';
import type { z } from 'zod';
import type { BaseCredentialType, CredentialType } from './credential.types';

export type AchievementCredentialSubjectType = z.infer<typeof AchievementCredentialSubjectSchema>;
export type AchievementCredentialType = z.infer<typeof AchievementCredentialSchema>;
export type AchievementCredentialListType = z.infer<typeof AchievementCredentialList>;
export type AchievementCredentialDataType = z.infer<typeof AchievementCredentialData>;
export type AchievementVoucherType = z.infer<typeof AchievementVoucher>;

export const isAchievementCredential = (credential: CredentialType): credential is AchievementCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return subject && 'achievement' in subject && subject?.category === 'Achievement';
};

export const isAchievementBaseCredential = (
	credential: BaseCredentialType
): credential is AchievementCredentialType['credential'] => {
	const subject = credential.credentialSubject;
	return subject && 'achievement' in subject && subject?.category === 'Achievement';
};
