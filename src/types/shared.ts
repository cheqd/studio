import type {
	IDIDManager,
	IKeyManager,
	IDataStore,
	IResolver,
	ICredentialIssuer,
	ICredentialVerifier,
	TAgent,
	VerificationPolicies,
} from '@veramo/core';
import type { ICheqd, CheqdDIDProvider } from '@cheqd/did-provider-cheqd';
import type { ICredentialIssuerLD } from '@veramo/credential-ld';
import type { AbstractIdentifierProvider } from '@veramo/did-manager';
import type { AbstractKeyManagementSystem } from '@veramo/key-manager';
import type { DataSource } from 'typeorm';
import { CheqdNetwork } from '@cheqd/sdk';
import type { IReturn } from '../middleware/auth/routine.js';
import type { ICommonErrorResponse } from './authentication.js';
import { StatusCodes } from 'http-status-codes';

const DefaultUuidPattern = '([a-zA-Z0-9-]{36})';
const DefaultMethodSpecificIdPattern = `(?:[a-zA-Z0-9]{21,22}|${DefaultUuidPattern})`;
const DefaultNamespacePattern = `(${CheqdNetwork.Mainnet}|${CheqdNetwork.Testnet})`;

export const DefaultDidUrlPattern = new RegExp(
	`^did:cheqd:${DefaultNamespacePattern}:${DefaultMethodSpecificIdPattern}$`
);
export const DefaultNetworkPattern = new RegExp(`did:cheqd:${DefaultNamespacePattern}:.*`);

export type SpecValidationResult = {
	valid: boolean;
	error?: string;
};

export type VeramoAgent = TAgent<
	IDIDManager &
		IKeyManager &
		IDataStore &
		IResolver &
		ICredentialIssuer &
		ICredentialVerifier &
		ICheqd &
		ICredentialIssuerLD
>;

export type CreateAgentRequest = {
	providers?: Record<string, AbstractIdentifierProvider>;
	kms?: Record<string, AbstractKeyManagementSystem>;
	dbConnection: DataSource;
	cheqdProviders?: CheqdDIDProvider[];
	enableResolver?: boolean;
	enableCredential?: boolean;
};

export interface IErrorResponse {
	errorCode: string;
	message: string;
}

export type UnsuccessfulResponseBody = {
	error: string;
};

export type UnsuccessfulQueryResponseBody = UnsuccessfulResponseBody;

export type ValidationErrorResponseBody = UnsuccessfulResponseBody;

export class CommonReturn implements IReturn {
	returnOk(data = {}): ICommonErrorResponse {
		return {
			status: StatusCodes.OK,
			error: '',
			data: data,
		};
	}

	returnError(status: number, error: string, data = {}): ICommonErrorResponse {
		return {
			status: status,
			error: error,
			data: data,
		};
	}
}
export interface VerificationOptions {
	fetchRemoteContexts?: boolean;
	domain?: string;
	verifyStatus?: boolean;
	policies?: VerificationPolicies;
	allowDeactivatedDid?: boolean;
}
export interface IBooleanResponse {
	status: boolean;
	error?: string;
}
