import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import mailchimp from '@mailchimp/mailchimp_marketing';

dotenv.config();

// Single initialization at module load (if enabled)
if (
    process.env.MAILCHIMP_ENABLED === 'true' &&
    process.env.MAILCHIMP_API_KEY &&
    process.env.MAILCHIMP_SERVER_PREFIX
) {
    mailchimp.setConfig({
        apiKey: process.env.MAILCHIMP_API_KEY,
        server: process.env.MAILCHIMP_SERVER_PREFIX,
    });
}

export class MailchimpHelper {
    private static getListId(): string | null {
        return process.env.MAILCHIMP_LIST_ID || null;
    }

    private static getSubscriberHash(email: string): string {
		// MD5 hash of lowercase email (Mailchimp requirement)
		return crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex');
	}

	/**
	 * Add or update a contact in Mailchimp with the specified tag
	 * @param email Email address
	 * @param firstName User's first name (optional)
	 * @param lastName User's last name (optional)
	 * @param tag Tag to add (default: "cheqd_Studio")
	 */
	static async addOrUpdateContact(
		email: string,
		firstName?: string,
		lastName?: string,
		tag: string = 'cheqd_Studio'
	): Promise<{ success: boolean; status: number; error?: string }> {
		const listId = this.getListId();
		if (!listId) {
			return {
				success: false,
				status: 500,
				error: 'Mailchimp list ID not configured',
			};
		}

		const normalizedEmail = email.trim().toLowerCase();
		const subscriberHash = this.getSubscriberHash(normalizedEmail);

		try {
			// Upsert the member (creates if not exists, updates if exists)
			const upsertPayload: any = {
				email_address: normalizedEmail,
				status_if_new: 'subscribed',
			};
			if (firstName || lastName) {
				upsertPayload.merge_fields = {
					...(firstName ? { FNAME: firstName } : {}),
					...(lastName ? { LNAME: lastName } : {}),
				};
			}
			await mailchimp.lists.setListMember(listId, subscriberHash, upsertPayload);

			// Get existing tags
			const currentTags = await mailchimp.lists.getListMemberTags(listId, subscriberHash);
			const existingActive = new Set<string>(
				(currentTags?.tags ?? [])
					.filter((t: { status: string }) => t.status === 'active')
					.map((t: { name: string }) => t.name)
			);

			// Add tag if it doesn't exist
			if (!existingActive.has(tag)) {
				await mailchimp.lists.updateListMemberTags(listId, subscriberHash, {
					tags: [{ name: tag, status: 'active' }],
				});
			}

			return {
				success: true,
				status: 200,
			};
		} catch (error: any) {
			return {
				success: false,
				status: error?.status || 500,
				error: error?.message || error?.title || `Mailchimp API error: ${String(error)}`,
			};
		}
	}
}

