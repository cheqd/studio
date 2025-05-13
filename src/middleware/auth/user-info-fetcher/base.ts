import type { Request, Response } from 'express';
import type { IOAuthProvider } from '../oauth/abstract.js';
import { CustomerService } from '../../../services/api/customer.js';
import { StatusCodes } from 'http-status-codes';
import { UserService } from '../../../services/api/user.js';

export interface IUserInfoOptions {
	[key: string]: any;
}

export interface IUserInfoFetcher {
	fetch(
		request: Request,
		response: Response,
		oauthProvider: IOAuthProvider,
		options?: IUserInfoOptions
	): Promise<Response | undefined>;
}

export class UserInfoHelper {
	setScopes(scopes: string[], response: Response) {
		response.locals.scopes = scopes;
		return;
	}
	async setCustomerEntity(customerId: string, response: Response): Promise<Response | undefined> {
		const customerEntity = await CustomerService.instance.get(customerId);
		if (!customerEntity) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Unexpected error: Customer entity for handling such request is not found in internal storage. CustomerId: ${customerId}`,
			});
		}
		const userEntity = await UserService.instance.findOne({ customer: customerEntity });
		if (!userEntity) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Unexpected error: User entity for handling such request is not found in internal storage. CustomerId: ${customerId}`,
			});
		}
		response.locals.customer = customerEntity;
		response.locals.user = userEntity;
		return;
	}

	async setUserEntity(logToId: string, response: Response): Promise<Response | undefined> {
		const entity = await UserService.instance.get(logToId, { customer: true });
		if (!entity || !entity.customer) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Unexpected error: User entity for handling such request is not found in internal storage`,
			});
		}
		response.locals.user = entity;
		response.locals.customer = entity.customer;
		return;
	}
}
