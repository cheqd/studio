import { z } from 'zod';
import { BaseCredentialSchema, BaseCredentialSubject, CredentialApplicationMetadataSchema } from './credential.schema';
import { makeVoucherCredentialData, makeVoucherSchema } from './voucher.schema';

export const DiscordCredentialSubjectSchema = BaseCredentialSubject;

export const BaseDiscordCredentialSchema = BaseCredentialSchema.extend({
	credentialSubject: DiscordCredentialSubjectSchema,
});

export const DiscordCredentialSchema = z.object({
	credential: BaseDiscordCredentialSchema,
	appMeta: CredentialApplicationMetadataSchema,
});

export const DiscordCredentialList = z.array(DiscordCredentialSchema);
export const DiscordCredentialData = makeVoucherCredentialData(DiscordCredentialSubjectSchema);
export const DiscordVoucher = makeVoucherSchema(DiscordCredentialData);
export const DiscordCredentialTemplateId = 'SOCIALPROFILE' as const;
