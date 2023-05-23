import type {
	BaseEndorsementCredentialSchema,
	EndorsementCredentialList,
	EndorsementCredentialSchema,
	EndorsementCredentialSubjectSchema,
} from '$shared/schema';
import type { z } from 'zod';
import type { BaseCredentialType, CredentialType } from './credential.types';

export type EndorsementCredentialSubjectType = z.infer<typeof EndorsementCredentialSubjectSchema>;
export type BaseEndorsementCredentialType = z.infer<typeof BaseEndorsementCredentialSchema>;
export type EndorsementCredentialType = z.infer<typeof EndorsementCredentialSchema>;
export type EndorsementCredentialListType = z.infer<typeof EndorsementCredentialList>;

export const isContentCreatorCredential = (credential: CredentialType): credential is EndorsementCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return (
		subject &&
		subject.category === 'Endorsement' &&
		'endorsement' in subject &&
		String(subject?.endorsement?.type).includes('Content Creator')
	);
};

export const isMemeMasterCredential = (credential: CredentialType): credential is EndorsementCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return (
		subject &&
		subject.category === 'Endorsement' &&
		'endorsement' in subject &&
		String(subject?.endorsement?.type).includes('Meme Master')
	);
};

export const isNodeContributorCredential = (credential: CredentialType): credential is EndorsementCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return (
		subject &&
		subject.category === 'Endorsement' &&
		'endorsement' in subject &&
		String(subject?.endorsement?.type).includes('cheqd Node Contributor')
	);
};

export const isDocsContributorCredential = (credential: CredentialType): credential is EndorsementCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return (
		subject &&
		subject.category === 'Endorsement' &&
		'endorsement' in subject &&
		String(subject?.endorsement?.type).includes('cheqd Docs Contributor')
	);
};

export const isEndorsementBaseCredential = (
	credential: BaseCredentialType
): credential is EndorsementCredentialType['credential'] => {
	const subject = credential.credentialSubject;
	return subject && subject.category === 'Endorsement' && 'endorsement' in subject;
};
