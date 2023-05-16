import type { BaseVoucherType, CredentialMeta } from '../types';
import type { WebPageListType } from '../types/credential.types';
import { BaseCredentialSubject, CredentialClaimStatusSchema } from './credential.schema';

export const filterVouchersByDiscordUsername = (userIdentifier: string, voucher: BaseVoucherType) => {
    const voucherCredentials = voucher.json.credentials;
    const userVoucherList: CredentialMeta[] = [];
    voucherCredentials.forEach((voucherCred) => {
        const result = BaseCredentialSubject.safeParse(voucherCred.credentialData.credentialSubject);
        if (result.success) {
            const subject = result.data
            const voucherUsername = (subject.socialProfile.webPage as WebPageListType)[0].identifier;
            if (voucherUsername === userIdentifier || voucherUsername.split('#')[0] === userIdentifier) {
                userVoucherList.push({
                    importedAt: new Date(),
                    id: voucher.code, // this is the uuid
                    type: voucherCred.type,
                    status: CredentialClaimStatusSchema.enum.CLAIM_PENDING,
                    voucherId: voucher.code,
                });
            }
        } else {
            console.warn('error parsing voucher response: ', result.error)
        }
    });

    return userVoucherList;
};
