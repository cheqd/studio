import type { z } from 'zod';
import type {
    BaseVoucherSchema,
    BaseCredentialDataSchema,
    BaseVoucherCredentialData,
    VoucherConfigResponseSchema,
} from '$shared/schema'

export type BaseVoucherType = z.infer<typeof BaseVoucherSchema>
export type BaseCredentialDataType = z.infer<typeof BaseCredentialDataSchema>
export type BaseVoucherCredentialDataType = z.infer<typeof BaseVoucherCredentialData>
export type VoucherConfigResponseType = z.infer<typeof VoucherConfigResponseSchema>
