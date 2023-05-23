import type { z } from 'zod';
import type {
	BaseEventCredentialSchema,
	BaseProductAlphaEventCredentialSchema,
	Event,
	EventCredentialList,
	EventCredentialSchema,
	EventCredentialSubjectSchema,
	ProductAlphaEventCredentialList,
	ProductAlphaEventCredentialSchema,
	ProductAlphaEventCredentialSubjectSchema,
} from '$shared/schema';
import type { BaseCredentialType, CredentialType } from './credential.types';

export type EventType = z.infer<typeof Event>;
export type EventCredentialSubjectType = z.infer<typeof EventCredentialSubjectSchema>;
export type BaseEventCredentialType = z.infer<typeof BaseEventCredentialSchema>;
export type EventCredentialType = z.infer<typeof EventCredentialSchema>;
export type EventCredentialListType = z.infer<typeof EventCredentialList>;
export type ProductAlphaEventCredentialSubjectType = z.infer<typeof ProductAlphaEventCredentialSubjectSchema>;
export type BaseProductAlphaEventCredentialType = z.infer<typeof BaseProductAlphaEventCredentialSchema>;
export type ProductAlphaEventCredentialType = z.infer<typeof ProductAlphaEventCredentialSchema>;
export type ProductAlphaEventCredentialListType = z.infer<typeof ProductAlphaEventCredentialList>;

export const isProductAlphaEventCredential = (
	credential: CredentialType
): credential is ProductAlphaEventCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return (
		subject &&
		'event' in subject &&
		subject?.category === 'Event' &&
		String(subject?.event?.type).includes('March Product Alpha')
	);
};

export const isCheqdTeamEventCredential = (
	credential: CredentialType
): credential is ProductAlphaEventCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return (
		subject &&
		'event' in subject &&
		subject?.category === 'Event' &&
		String(subject?.event?.type).includes('cheqd Team Events')
	);
};

export const isTwitterSpacesEventCredential = (
	credential: CredentialType
): credential is ProductAlphaEventCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return (
		subject &&
		'event' in subject &&
		subject?.category === 'Event' &&
		String(subject?.event?.type).includes('March 2023 Twitter Spaces')
	);
};

export const isEventBaseCredential = (
	credential: BaseCredentialType
): credential is ProductAlphaEventCredentialType['credential'] => {
	const subject = credential.credentialSubject;
	return subject && 'event' in subject && subject?.category === 'Event';
};
