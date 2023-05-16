import { z } from 'zod';
import { BaseCredentialSchema, BaseCredentialSubject, CredentialApplicationMetadataSchema } from './credential.schema';
import { makeVoucherCredentialData, makeVoucherSchema } from './voucher.schema';

export const BaseLearnSubject = z.object({
    type: z.string(),
    description: z.string(),
    educationalCredentialAwarded: z.string(),
    educationalLevel: z.string(),
    provider: z.object({ type: z.string(), name: z.string() }),
});

export const LearnCredentialSubjectSchema = BaseCredentialSubject.extend({
    learn: BaseLearnSubject,
});

export const BaseLearnCredentialSchema = BaseCredentialSchema.extend({
    credentialSubject: LearnCredentialSubjectSchema,
});

export const LearnCredentialSchema = z.object({
    credential: BaseLearnCredentialSchema,
    appMeta: CredentialApplicationMetadataSchema,
});

export const LearnCredentialList = z.array(LearnCredentialSchema);
export const LearnCredentialData = makeVoucherCredentialData(LearnCredentialSubjectSchema);
export const LearnVoucher = makeVoucherSchema(LearnCredentialData);
export const LearnCredentialTemplateId = 'LEARN' as const;

export const SSIMasterCredentialSubjectSchema = LearnCredentialSubjectSchema.extend({

})

export const BaseSSIMasterCredentialSchema = BaseCredentialSubject.extend({
    learn: BaseLearnSubject.extend({
        dateCreated: z.date(),
    })
})

export const SSIMasterCredentialSchema = z.object({
    credential: BaseSSIMasterCredentialSchema,
    appMeta: CredentialApplicationMetadataSchema,
})

export const SSIMasterCredentialList = z.array(SSIMasterCredentialSchema);
export const SSIMasterCredentialData = makeVoucherCredentialData(SSIMasterCredentialSubjectSchema);
export const SSIMasterVoucher = makeVoucherSchema(SSIMasterCredentialData);
export const SSIMasterCredentialTemplateId = 'LEARN' as const;
