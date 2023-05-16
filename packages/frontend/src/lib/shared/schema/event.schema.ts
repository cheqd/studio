import { z } from 'zod';
import { BaseCredentialSchema, BaseCredentialSubject, CredentialApplicationMetadataSchema } from './credential.schema';
import { makeVoucherCredentialData, makeVoucherSchema } from './voucher.schema';

export const Event = z.object({
    type: z.string(),
    description: z.string(),
    startDate: z.string(),
    eventAttendanceMode: z.string(),
    organizer: z.string(),
})

export const EventCredentialSubjectSchema = BaseCredentialSubject.extend({
    event: Event
});

export const BaseEventCredentialSchema = BaseCredentialSchema.extend({
    credentialSubject: EventCredentialSubjectSchema,
});

export const EventCredentialSchema = z.object({
    credential: BaseEventCredentialSchema,
    appMeta: CredentialApplicationMetadataSchema,
});

export const EventCredentialList = z.array(EventCredentialSchema);
export const EventCredentialData = makeVoucherCredentialData(EventCredentialSubjectSchema);
export const EventVoucher = makeVoucherSchema(EventCredentialData);
export const EventCredentialTemplateId = 'EVENT' as const;

export const ProductAlphaEventCredentialSubjectSchema = EventCredentialSubjectSchema.extend({
    event: Event.extend({
        issueNumber: z.number()
    })
})

export const BaseProductAlphaEventCredentialSchema = BaseCredentialSchema.extend({
    credentialSubject: ProductAlphaEventCredentialSubjectSchema,
});

export const ProductAlphaEventCredentialSchema = z.object({
    credential: BaseEventCredentialSchema,
    appMeta: CredentialApplicationMetadataSchema,
});

export const ProductAlphaEventCredentialList = z.array(EventCredentialSchema);
export const ProductAlphaEventCredentialData = makeVoucherCredentialData(EventCredentialSubjectSchema);
export const ProductAlphaEventVoucher = makeVoucherSchema(EventCredentialData);
export const ProductAlphaEventCredentialTemplateId = 'EVENT' as const;
