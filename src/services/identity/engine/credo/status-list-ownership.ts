import type { DataSource } from 'typeorm';
import type { StatusListOwnership } from './status-lists.js';

/** Who registered a list, from Studio's `statusRegistry` table. Answers from a count, scoped in the query. */
export class TypeOrmStatusListOwnership implements StatusListOwnership {
	constructor(private readonly dataSource: DataSource) {}

	async countClaimedByOthers(customerId: string, did: string, name: string): Promise<number> {
		const rows: { count: string }[] = await this.dataSource.query(
			`SELECT count(*)::text AS count FROM "statusRegistry"
			 WHERE "issuerId" = $1 AND "registryName" = $2 AND "customerId" <> $3`,
			[did, name, customerId]
		);
		return Number(rows[0]?.count ?? 0);
	}
}
