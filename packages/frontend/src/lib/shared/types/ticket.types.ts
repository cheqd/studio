import type {
	TicketCredentialData,
	TicketCredentialList,
	TicketCredentialSchema,
	TicketCredentialSubjectSchema,
	TicketVoucher,
} from '$shared/schema';
import type { z } from 'zod';
import type { BaseCredentialType, CredentialType } from './credential.types';

export type TicketCredentialSubjectType = z.infer<typeof TicketCredentialSubjectSchema>;
export type TicketCredentialType = z.infer<typeof TicketCredentialSchema>;
export type TicketCredentialListType = z.infer<typeof TicketCredentialList>;
export type TicketCredentialDataType = z.infer<typeof TicketCredentialData>;
export type TicketVoucherType = z.infer<typeof TicketVoucher>;

export const isTicketCredential = (credential: CredentialType): credential is TicketCredentialType => {
	const { credential: baseCredential } = credential;
	const subject = baseCredential.credentialSubject;
	return subject && 'ticket' in subject && subject?.category === 'Ticket';
};

export const isTicketBaseCredential = (
	credential: BaseCredentialType
): credential is TicketCredentialType['credential'] => {
	const subject = credential.credentialSubject;
	return subject && 'ticket' in subject && subject?.category === 'Ticket';
};
