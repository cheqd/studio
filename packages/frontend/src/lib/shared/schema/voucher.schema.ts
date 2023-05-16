import type { BaseVoucherCredentialDataType } from '$shared/types';
import { z } from 'zod';

export const StringToJSON = z.string().transform((json, ctx): BaseVoucherCredentialDataType => {
	try {
		return JSON.parse(json);
	} catch (e) {
		ctx.addIssue({ code: 'custom', message: 'Invalid JSON' });
		return z.NEVER;
	}
});

export const BaseVoucherSchema = z.object({
	code: z.string().uuid(),
	issuer: z.string(),
	json: StringToJSON,
});

export const makeVoucherSchema = <T extends z.ZodSchema>(schema: T) => {
	return BaseVoucherSchema.merge(
		z.object({
			json: z.string().transform((json, ctx): z.infer<typeof schema> => {
				try {
					return JSON.parse(json);
				} catch (e) {
					ctx.addIssue({ code: 'custom', message: 'Invalid JSON' });
					return z.NEVER;
				}
			}),
		})
	);
};

export const BaseCredentialDataSchema = z.object({
	credentialData: z.object({
		credentialSubject: z.any(),
	}),
	type: z.string(),
});

export const BaseVoucherCredentialData = z.object({
	credentials: z.array(BaseCredentialDataSchema),
});

export const makeVoucherCredentialData = <T extends z.ZodSchema>(schema: T) => {
	return BaseVoucherCredentialData.merge(
		z.object({
			credentials: z.array(
				z.object({
					credentialData: z.object({
						credentialSubject: schema,
					}),
					type: z.string(),
				})
			),
		})
	);
};

export const VoucherConfigResponseSchema = z.record(z.string().uuid(), makeVoucherSchema(BaseVoucherCredentialData));
