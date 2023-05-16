import type { z } from 'zod';
import type {
	CredentialSchema,
	BaseCredentialSchema,
	BaseCredentialSchemaList,
	BaseCredentialSchemaSet,
	BaseCredentialSubject,
	CredentialClaimStatusSchema,
	CredentialFilterSchema,
	CredentialSchemaSchema,
	CredentialStatus,
	CredentialTypeListSchema,
	CredentialTypeSchema,
	CredentialSchemaSet,
	CredentialSchemaList,
	PartialCredentialSchema,
	PartialBaseCredentialSchema,
	WebPage,
	SocialProfileSubject,
	WebPageList,
	CredentialApplicationMetadataSchema,
} from '$shared/schema';

export type BaseCredentialSubjectType = z.infer<typeof BaseCredentialSubject>;
export type CredentialType = z.infer<typeof CredentialSchema>;
export type CredentialApplicationMetadataType = z.infer<typeof CredentialApplicationMetadataSchema>;
export type CredentialSchemaType = z.infer<typeof CredentialSchemaSchema>;
export type CredentialStatusType = z.infer<typeof CredentialStatus>;
export type CredentialTypeType = z.infer<typeof CredentialTypeSchema>;
export type CredentialClaimStatusType = z.infer<typeof CredentialClaimStatusSchema>;
export type CredentialTypeListType = z.infer<typeof CredentialTypeListSchema>;
export type CredentialFilterType = z.infer<typeof CredentialFilterSchema>;
export type BaseCredentialType = z.infer<typeof BaseCredentialSchema>;
export type BaseCredentialSetType = z.infer<typeof BaseCredentialSchemaSet>;
export type BaseCredentialListType = z.infer<typeof BaseCredentialSchemaList>;
export type CredentialSetType = z.infer<typeof CredentialSchemaSet>;
export type CredentialListType = z.infer<typeof CredentialSchemaList>;
export type PartialCredentialType = z.infer<typeof PartialCredentialSchema>;
export type PartialBaseCredentialType = z.infer<typeof PartialBaseCredentialSchema>;
export type WebPageType = z.infer<typeof WebPage>;
export type WebPageListType = z.infer<typeof WebPageList>;
export type SocialProfileSubjectType = z.infer<typeof SocialProfileSubject>;
