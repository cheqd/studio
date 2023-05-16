import { z } from 'zod';
import { BaseCredentialSchema, BaseCredentialSubject, CredentialApplicationMetadataSchema } from './credential.schema';
import { makeVoucherCredentialData, makeVoucherSchema } from './voucher.schema';

export const Location = z.object({
	'@type': z.string(),
	name: z.string(),
	address: z.object({
		'@type': z.string(),
		addressLocality: z.string(),
		addressCountry: z.string(),
	}),
});

export const ReservationFor = z.object({
	'@type': z.string(),
	name: z.string(),
	startDate: z.string(),
	location: Location,
});

export const TicketCredentialSubjectSchema = BaseCredentialSubject.extend({
	ticket: z.object({
		type: z.string(),
		description: z.string(),
		reservationFor: ReservationFor,
	}),
});

export const BaseTicketCredentialSchema = BaseCredentialSchema.extend({
	credentialSubject: TicketCredentialSubjectSchema,
});

export const TicketCredentialSchema = z.object({
	credential: BaseTicketCredentialSchema,
	appMeta: CredentialApplicationMetadataSchema,
});

export const TicketCredentialList = z.array(TicketCredentialSchema);
export const TicketCredentialData = makeVoucherCredentialData(TicketCredentialSubjectSchema);
export const TicketVoucher = makeVoucherSchema(TicketCredentialData);
export const TicketCredentialTemplateId = 'TICKET' as const;
