import type { UserEntity } from '../../database/entities/user.entity.js';
import type { APIKeyEntity } from '../../database/entities/api.key.entity.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { ExportedPaymentAccountKey } from '../../types/account.js';
import type { ListOperationOptions } from '../../types/track.js';

/*
 * API keys, the operation log and payment accounts are Studio concerns, not identity-engine concerns: they
 * belong to no engine and must not be re-implemented by a new one. They are split out of `IIdentityService`
 * here. `IIdentityService` still extends them so that existing call sites (`strategy.agent.setAPIKey(...)`)
 * keep compiling unchanged; they are served by the same Studio services as before.
 * TODO: move those call sites to `APIKeyService`, `OperationService` and `PaymentAccountService` directly,
 * then drop the extension.
 */

export interface IApiKeyStore {
	setAPIKey(apiKey: string, customer: CustomerEntity, user: UserEntity): Promise<APIKeyEntity>;
	updateAPIKey(apiKey: APIKeyEntity, newApiKey: string): Promise<APIKeyEntity>;
	getAPIKey(customer: CustomerEntity, user: UserEntity): Promise<APIKeyEntity | null>;
	decryptAPIKey(apiKey: string): Promise<string>;
}

export interface IOperationLog {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	listOperations(options: ListOperationOptions, customer: CustomerEntity): Promise<any>;
}

export interface IPaymentAccountExport {
	exportPaymentAccountKeys(customer: CustomerEntity): Promise<ExportedPaymentAccountKey[]>;
}

export type StudioAccountServices = IApiKeyStore & IOperationLog & IPaymentAccountExport;
