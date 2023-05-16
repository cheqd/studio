import { z } from 'zod';
import { BaseCredentialSchema, BaseCredentialSubject, CredentialApplicationMetadataSchema } from './credential.schema';
import { makeVoucherCredentialData, makeVoucherSchema } from './voucher.schema';

export const CommunityRoleCredentialSubject = BaseCredentialSubject.extend({
	communityRole: z.object({
		type: z.string(),
		description: z.string(),
		issueNumber: z.string().optional(),
	}),
});

export const CommunityRoleBaseCredentialSchema = BaseCredentialSchema.extend({
	credentialSubject: CommunityRoleCredentialSubject,
});

export const CommunityRoleCredentialSchema = z.object({
	credential: CommunityRoleBaseCredentialSchema,
	appMeta: CredentialApplicationMetadataSchema,
});

export const CommunityRoleBaseCredentialList = z.array(CommunityRoleBaseCredentialSchema);
export const CommunityRoleCredentialList = z.array(CommunityRoleCredentialSchema);

const CommunityRoleCredentialData = makeVoucherCredentialData(CommunityRoleCredentialSubject);
export const CommunityRoleVoucher = makeVoucherSchema(CommunityRoleCredentialData);
export const CommunityRoleCredentialTemplateId = 'COMMUNITYROLE' as const;

export const BetaCredCredentialSubject = BaseCredentialSubject.extend({
	issueNumber: z.number().default(0),
	communityRole: z.object({
		type: z.string(),
		description: z.string(),
	}),
});

export const BetaCredBaseCredentialSchema = BaseCredentialSchema.extend({
	credentialSubject: BetaCredCredentialSubject,
});

export const BetaCredCredentialSchema = z.object({
	credential: CommunityRoleBaseCredentialSchema,
	appMeta: CredentialApplicationMetadataSchema,
});

const BetaCredCredentialData = makeVoucherCredentialData(BetaCredCredentialSubject);
export const BetaCredVoucher = makeVoucherSchema(BetaCredCredentialData);
export const BetaCredBaseCredentialList = z.array(BetaCredBaseCredentialSchema);
export const BetaCredCredentialList = z.array(BetaCredCredentialSchema);
