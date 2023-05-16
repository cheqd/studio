import { z } from 'zod';
import { BaseCredentialSchema, BaseCredentialSubject, CredentialApplicationMetadataSchema } from './credential.schema';
import { makeVoucherCredentialData, makeVoucherSchema } from './voucher.schema';

export const AchievementCredentialSubjectSchema = BaseCredentialSubject.extend({
	achievement: z.object({
		type: z.string(),
		description: z.string(),
	}),
});

export const BaseAchievementCredentialSchema = BaseCredentialSchema.extend({
	credentialSubject: AchievementCredentialSubjectSchema,
});

export const AchievementCredentialSchema = z.object({
	credential: BaseAchievementCredentialSchema,
	appMeta: CredentialApplicationMetadataSchema,
});

export const AchievementCredentialList = z.array(AchievementCredentialSchema);
export const AchievementCredentialData = makeVoucherCredentialData(AchievementCredentialSubjectSchema);
export const AchievementVoucher = makeVoucherSchema(AchievementCredentialData);
export const AchievementCredentialTemplateId = 'ACHIEVEMENT' as const;
