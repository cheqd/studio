import type { z } from 'zod';
import type {
	CommunityRoleCredentialSchema,
	CommunityRoleCredentialList,
	CommunityRoleCredentialSubject,
	CommunityRoleVoucher,
	BetaCredCredentialSubject,
	BetaCredBaseCredentialSchema,
	BetaCredBaseCredentialList,
	BetaCredCredentialList,
	BetaCredCredentialSchema,
} from '$shared/schema';
import type { BaseCredentialType, CredentialType } from './credential.types';

export type CommunityRoleCredentilSubjectType = z.infer<typeof CommunityRoleCredentialSubject>;
export type CommunityRoleCredentialType = z.infer<typeof CommunityRoleCredentialSchema>;
export type CommunityRoleCredentialListType = z.infer<typeof CommunityRoleCredentialList>;
export type CommunityRoleCredentialDataType = z.infer<typeof CommunityRoleCredentialSchema>;
export type CommunityRoleVoucherType = z.infer<typeof CommunityRoleVoucher>;
export type BetaCredCredentiaSType = z.infer<typeof BetaCredCredentialSubject>;

export type BetaCredCredentialSubjectType = z.infer<typeof BetaCredCredentialSubject>;
export type BetaCredBaseCredentialType = z.infer<typeof BetaCredBaseCredentialSchema>;
export type BetaCredCredentialSchema = z.infer<typeof BetaCredCredentialSchema>;
export type BetaCredBaseCredentialListType = z.infer<typeof BetaCredBaseCredentialList>;
export type BetaCredCredentialListType = z.infer<typeof BetaCredCredentialList>;

export const isRebelSoldierCredential = (credential: CredentialType): credential is CommunityRoleCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return (
		subject &&
		subject.category === 'CommunityRole' &&
		'communityRole' in subject &&
		String(subject?.communityRole?.type).includes('Moderator')
	);
};

export const isRebelWarriorCredential = (credential: CredentialType): credential is CommunityRoleCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return (
		subject &&
		subject.category === 'CommunityRole' &&
		'communityRole' in subject &&
		String(subject?.communityRole?.type).includes('Ambassador')
	);
};

export const isCheqmateCredential = (credential: CredentialType): credential is CommunityRoleCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return (
		subject &&
		subject.category === 'CommunityRole' &&
		'communityRole' in subject &&
		String(subject?.communityRole?.type).includes('cheqmate')
	);
};

export const isAdvisorCredential = (credential: CredentialType): credential is CommunityRoleCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return (
		subject &&
		subject.category === 'CommunityRole' &&
		'communityRole' in subject &&
		String(subject?.communityRole?.type).includes('Advisor')
	);
};

export const isBetaCredCredential = (credential: CredentialType): credential is CommunityRoleCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return (
		subject &&
		subject.category === 'CommunityRole' &&
		'communityRole' in subject &&
		String(subject?.communityRole?.type).includes('Private Beta Tester')
	);
};

export const isCommunityRoleBaseCredential = (
	credential: BaseCredentialType
): credential is CommunityRoleCredentialType['credential'] => {
	const subject = credential.credentialSubject;
	return subject && subject.category === 'CommunityRole' && 'communityRole' in subject;
};
