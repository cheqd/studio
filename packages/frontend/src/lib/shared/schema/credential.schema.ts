import type { WebPageListType } from '$shared/types';
import { z } from 'zod';

export const WebPage = z.object({
	'@type': z.string(),
	description: z.string(),
	name: z.string(),
	identifier: z.string(),
	lastReviewed: z.string().optional(),
	thumbnailUrl: z.string().optional(),
	url: z.string().optional(),
});

export const WebPageList = z.array(WebPage);

export const SocialProfileSubject = z.object({
	type: z.string(),
	description: z.string(),
	webPage: z.record(z.string(), WebPage).or(
		z.array(WebPage).transform((webPageList) => {
			if (Array.isArray(webPageList)) {
				return webPageList;
			}

			return Object.keys(webPageList).map((webPage) => {
				return webPageList[webPage];
			});
		})
	),
});

export const BaseCredentialSubject = z.object({
	id: z.string(),
	voucherId: z.string(),
	category: z.string(),
	linkedImage: z.string().optional(),
	socialProfile: SocialProfileSubject,
});

export const CredentialSchemaSchema = z.object({
	id: z.string(),
	type: z.string(),
});

export const CredentialStatus = z.object({
	id: z.string(),
	type: z.string(),
	statusPurpose: z.string(),
	statusListIndex: z.string(),
	statusListCredential: z.string(),
});

export const CredentialTypeSchema = z.enum([
	'Socials',
	'Roles',
	'Achievements',
	'Events',
	'Tickets',
	'Learn',
	'Endorsement',
]);
export const CredentialClaimStatusSchema = z.enum(['CLAIMED', 'CLAIM_PENDING', 'INELIGIBLE', 'PENDING_CONFIRMATION']);
export const CredentialTypeListSchema = z.array(CredentialTypeSchema);
export const CredentialFilterSchema = z.enum([...CredentialClaimStatusSchema.options, 'ALL']);
export const CredentialProofSchema = z.union([z.object({ type: z.string().optional() }), z.record(z.any())]);

export const BaseCredentialSchema = z.object({
	'@context': z.array(z.string()).optional(),
	type: z.array(z.string()).optional(),
	id: z.string().optional(),
	issuer: z.string().optional(),
	issuanceDate: z.string().optional(),
	validFrom: z.string().optional(),
	credentialSchema: CredentialSchemaSchema.optional(),
	credentialStatus: CredentialStatus.optional(),
	expirationDate: z.string().optional(),
	proof: CredentialProofSchema.optional(), // optional, in case of unsigned credentials

	// this value is pretty much overwritten by the types that extend this schema
	// for e.g. - DiscordProfileCredential, CheqmateRoleCredential
	credentialSubject: z.any().optional(),
});

export const CredentialApplicationMetadataSchema = z.object({
	typeAlias: z.string().optional(),
	description: z.string().optional(),
	category: CredentialTypeSchema.optional(),
	status: CredentialClaimStatusSchema.optional(),
	profilePicture: z.string().optional(),
	internalCredentialId: z.string().optional(),
	credentialTemplateId: z.string().optional(),
});

export const CredentialSchema = z.object({
	credential: BaseCredentialSchema,
	appMeta: CredentialApplicationMetadataSchema,
});

export const PartialBaseCredentialSchema = BaseCredentialSchema.partial();

export const PartialCredentialSchema = z.object({
	credential: PartialBaseCredentialSchema,
	appMeta: CredentialApplicationMetadataSchema.partial(),
});

export const BaseCredentialSchemaSet = z.set(BaseCredentialSchema);
export const BaseCredentialSchemaList = z.array(BaseCredentialSchema);
export const CredentialSchemaSet = z.set(CredentialSchema);
export const CredentialSchemaList = z.array(CredentialSchema);
