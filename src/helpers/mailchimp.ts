import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import mailchimp from '@mailchimp/mailchimp_marketing';

dotenv.config();

export class MailchimpService {
	constructor() {
		if (!process.env.MAILCHIMP_API_KEY || !process.env.MAILCHIMP_SERVER_PREFIX) {
			throw new Error('Mailchimp configuration is missing');
		}

		mailchimp.setConfig({
			apiKey: process.env.MAILCHIMP_API_KEY,
			server: process.env.MAILCHIMP_SERVER_PREFIX,
		});
	}

	async upsertSubscriber(
		listId: string,
		email: string,
		firstName: string,
		lastName: string,
		tags?: readonly string[],
		company?: string | null
	): Promise<void> {
		const normalizedEmail = email.trim().toLowerCase();
		const subscriberHash = crypto.createHash('md5').update(normalizedEmail).digest('hex');

		const mergeFields: Record<string, string> = {};
		if (firstName) mergeFields.FNAME = firstName;
		if (lastName) mergeFields.LNAME = lastName;
		if (company) mergeFields.COMPANY = company;

		await mailchimp.lists.setListMember(listId, subscriberHash, {
			email_address: normalizedEmail,
			status_if_new: 'subscribed',
			...(Object.keys(mergeFields).length > 0 && { merge_fields: mergeFields }),
		});

		if (tags && tags.length > 0) {
			const current = (await mailchimp.lists.getListMemberTags(listId, subscriberHash)) as any;
			const existingActive = new Set<string>(
				(current?.tags ?? []).filter((t: any) => t.status === 'active').map((t: any) => t.name as string)
			);

			const missing = tags.filter((t) => !existingActive.has(t));
			if (missing.length > 0) {
				await mailchimp.lists.updateListMemberTags(listId, subscriberHash, {
					tags: missing.map((t) => ({ name: t, status: 'active' as const })),
				});
			}
		}
	}
}
