import { z } from 'zod';
import { BaseCredentialSchema, BaseCredentialSubject, CredentialApplicationMetadataSchema } from './credential.schema';
import { makeVoucherCredentialData, makeVoucherSchema } from './voucher.schema';

export const EndorsementCredentialSubjectSchema = BaseCredentialSubject.extend({
	endorsement: z.object({
		type: z.string(),
		description: z.string(),
	}),
});

export const BaseEndorsementCredentialSchema = BaseCredentialSchema.extend({
	credentialSubject: EndorsementCredentialSubjectSchema,
});

export const EndorsementCredentialSchema = z.object({
	credential: BaseEndorsementCredentialSchema,
	appMeta: CredentialApplicationMetadataSchema,
});

export const EndorsementCredentialList = z.array(EndorsementCredentialSchema);
export const EndorsementCredentialData = makeVoucherCredentialData(EndorsementCredentialSubjectSchema);
export const EndorsementVoucher = makeVoucherSchema(EndorsementCredentialData);
export const EndorsementCredentialTemplateId = 'ENDORSEMENT' as const;
