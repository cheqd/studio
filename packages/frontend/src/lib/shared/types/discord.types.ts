import type { z } from 'zod';
import type {
	DiscordCredentialSchema,
	DiscordCredentialData,
	DiscordCredentialList,
	DiscordCredentialSubjectSchema,
	DiscordVoucher,
} from '$shared/schema';
import type { CredentialType, BaseCredentialType } from './credential.types';

export type DiscordCredentialSubjectType = z.infer<typeof DiscordCredentialSubjectSchema>;
export type DiscordCredentialType = z.infer<typeof DiscordCredentialSchema>;
export type DiscordCredentialListType = z.infer<typeof DiscordCredentialList>;
export type DiscordCredentialDataType = z.infer<typeof DiscordCredentialData>;
export type DiscordVoucherType = z.infer<typeof DiscordVoucher>;

export const isDiscordCredential = (credential: CredentialType): credential is DiscordCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return (
		subject &&
		subject.category === 'SocialProfile' &&
		'socialProfile' in subject &&
		String(subject?.socialProfile?.type).includes('Discord Profile')
	);
};

export const isDiscordBaseCredential = (
	credential: BaseCredentialType
): credential is DiscordCredentialType['credential'] => {
	const subject = credential.credentialSubject;
	return (
		subject &&
		subject.category === 'SocialProfile' &&
		'socialProfile' in subject &&
		subject?.socialProfile?.type === 'Discord Profile'
	);
};
