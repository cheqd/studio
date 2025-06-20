import { OperationNameEnum, OperationDefaultFeeEnum } from '../../types/constants.js';
import {
	type IResourceTrack,
	type ITrackOperation,
	type ITrackResult,
	TrackOperationWithPayment,
} from '../../types/track.js';
import { toCoin } from './helpers.js';
import { OperationService } from '../api/operation.js';
import type { IObserver } from './types.js';
import { BaseOperationObserver } from './base.js';
import type { LogLevelDesc } from 'loglevel';
import type { OperationEntity } from '../../database/entities/operation.entity.js';
import { PaymentService } from '../api/payment.js';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { Coin } from '@cosmjs/amino';
import { CoinService } from '../api/coin.js';
import { PaymentAccountService } from '../api/payment-account.js';

export class DBOperationSubscriber extends BaseOperationObserver implements IObserver {
	protected logSeverity: LogLevelDesc = 'debug';

	async update(trackOperation: ITrackOperation): Promise<void> {
		// tracking operation in our DB. It handles all the operations
		const result = await this.trackOperation(trackOperation);
		const message = result.error
			? `Error while writing information about operation ${trackOperation.name} to DB: ${result.error}`
			: `Information about operation ${trackOperation.name} was successfully written to DB`;
		// notify about the result of tracking, e.g. log or datadog
		await this.notify({
			message: message,
			severity: result.error ? 'error' : this.logSeverity,
		});
	}

	async trackPayments(
		operationWithPayment: TrackOperationWithPayment,
		operationEntity: OperationEntity
	): Promise<ITrackResult> {
		const resource = await operationWithPayment.getResourceEntity();
		// For some operations, there might not be an associated resource
		// This is normal and should not be treated as an error

		for (const feePayment of operationWithPayment.feePaymentOptions) {
			// Create Fee Coin
			const feeCoin = await CoinService.instance.create(BigInt(feePayment.fee.amount), feePayment.fee.denom);
			// Create Amount Coin
			const amountCoin = await CoinService.instance.create(
				BigInt(feePayment.amount.amount),
				feePayment.amount.denom
			);

			// Fetch PaymentAccountEntity for fromAddress
			const fromAccountEntity = await PaymentAccountService.instance.get(feePayment.fromAddress);
			if (!fromAccountEntity) {
				throw new Error(`PaymentAccountEntity not found for address: ${feePayment.fromAddress}`);
			}

			const payment = await PaymentService.instance.create(
				feePayment.txHash as string,
				operationWithPayment.customer as CustomerEntity,
				operationEntity,
				feeCoin,
				amountCoin,
				feePayment.successful,
				feePayment.network,
				resource,
				fromAccountEntity,
				feePayment.toAddress,
				feePayment.timestamp
			);
			if (!payment) {
				return {
					operation: operationWithPayment,
					error: `Payment for operation ${operationWithPayment.name} was not written to DB`,
				} satisfies ITrackResult;
			}
		}
		return {
			operation: operationWithPayment,
			error: '',
		} satisfies ITrackResult;
	}

	async getDefaultFeeCoin(operation: ITrackOperation): Promise<Coin> {
		const defaultFee = 0;
		switch (operation.name) {
			case OperationNameEnum.DID_CREATE:
				return toCoin(BigInt(OperationDefaultFeeEnum.DID_CREATE));
			case OperationNameEnum.DID_UPDATE:
				return toCoin(BigInt(OperationDefaultFeeEnum.DID_UPDATE));
			case OperationNameEnum.DID_DEACTIVATE:
				return toCoin(BigInt(OperationDefaultFeeEnum.DID_DEACTIVATE));
		}
		if (
			operation.name === OperationNameEnum.RESOURCE_CREATE ||
			operation.name === OperationNameEnum.CREDENTIAL_STATUS_CREATE_ENCRYPTED ||
			operation.name === OperationNameEnum.CREDENTIAL_STATUS_CREATE_UNENCRYPTED ||
			operation.name === OperationNameEnum.CREDENTIAL_STATUS_UPDATE_ENCRYPTED ||
			operation.name === OperationNameEnum.CREDENTIAL_STATUS_UPDATE_UNENCRYPTED
		) {
			const resource = (operation.data as IResourceTrack).resource;
			if (!resource) {
				return toCoin(BigInt(defaultFee));
			}
			if (resource.mediaType === 'application/json') {
				return toCoin(BigInt(OperationDefaultFeeEnum.RESOURCE_CREATE_JSON));
			}
			if (resource.mediaType.includes('image')) {
				return toCoin(BigInt(OperationDefaultFeeEnum.RESOURCE_CREATE_IMAGE));
			}
			return toCoin(BigInt(OperationDefaultFeeEnum.RESOURCE_CREATE_OTHER));
		}
		return toCoin(BigInt(defaultFee));
	}

	async trackOperation(trackOperation: ITrackOperation): Promise<ITrackResult> {
		try {
			// Create Default Fee Coin
			const defaultFeeCoin = await this.getDefaultFeeCoin(trackOperation);
			const defaultFee = await CoinService.instance.create(BigInt(defaultFeeCoin.amount), defaultFeeCoin.denom);
			// Create operation entity
			const operationEntity = await OperationService.instance.create(
				trackOperation.category,
				trackOperation.name,
				defaultFee,
				false,
				trackOperation.successful,
				trackOperation.customer
			);

			if (!operationEntity) {
				throw new Error(`Operation ${trackOperation.name} was not written to DB`);
			}

			// Track payments
			if (trackOperation.feePaymentOptions) {
				const operationWithPayment = new TrackOperationWithPayment(trackOperation);
				const paymentValidation = operationWithPayment.validate();
				if (paymentValidation.error) {
					return {
						operation: trackOperation,
						error: `Error while validating payment options: ${paymentValidation.error}`,
					} satisfies ITrackResult;
				}
				return await this.trackPayments(operationWithPayment, operationEntity);
			}

			return {
				operation: trackOperation,
				error: '',
			} satisfies ITrackResult;
		} catch (error) {
			return {
				operation: trackOperation,
				error: `Error while writing information about operation ${trackOperation.name} to DB: ${(error as Error)?.message || error}`,
			} satisfies ITrackResult;
		}
	}
}
