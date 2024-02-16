import type { TransactionResult } from '@cheqd/did-provider-cheqd';
import { assert } from 'console';
import type { IFeePaymentOptions } from '../types/track';
import { CheqdNetwork } from '@cheqd/sdk';

// The algo for the fee analyzer is as follows:
// 1. Get all transfer events from txResponse.events
// 2. Get all tx events from txResponse.events with key as 'fee'
// 3. Group transfer events and tx events by amount

export class FeeAnalyzer {
	static async getBlockDate(txHash: string, network: CheqdNetwork): Promise<Date> {
		const timestampResponse = await (async function () {
			switch (network) {
				case CheqdNetwork.Testnet: {
					// get block info from testnet
					return await fetch('https://api.cheqd.network/cosmos/tx/v1beta1/txs/' + txHash);
				}
				case CheqdNetwork.Mainnet: {
					// get block info from mainnet
					return await fetch('https://api.cheqd.net/cosmos/tx/v1beta1/txs/' + txHash);
				}
			}
		})()
        if (!timestampResponse) {
            throw new Error('Failed to get block info');
        }
        const txResponse = await timestampResponse.json();
        if (!txResponse || !txResponse.tx_response || !txResponse.tx_response.timestamp) {
            throw new Error('Unexpected block format');
        }
        return new Date(txResponse.tx_response.timestamp);
	}

	static async getPaymentTrack(txResponse: TransactionResult, network: CheqdNetwork): Promise<IFeePaymentOptions[]> {
		const txEvents = txResponse.events || [];
		const transferEvents = txEvents.filter((event) => event.type === 'transfer').map((event) => event.attributes);
		// list of attributes. Each attributes is a list of key-value pairs
		const feeEvents = txEvents
			.filter((event) => event.type === 'tx' && event.attributes.some((attr) => attr.key === 'fee'))
			.map((event) => event.attributes);
		const paymentEntities: IFeePaymentOptions[] = [];

		assert(
			transferEvents.length === 2 * feeEvents.length,
			'Number of transfer events should be twice the number of fee events'
		);

		for (const feeEvent of feeEvents) {
			// Search for event where sender is the same as fee_payer. That means that sender wanted to send tokens and they heeded to pay the fee also
			const transferEvent = transferEvents
				.filter((event) =>
					event.find(
						(attr) =>
							attr.key === 'sender' &&
							attr.value === feeEvent.find((attr) => attr.key === 'fee_payer')?.value
					)
				)
				.filter((event) =>
					event.find(
						(attr) =>
							attr.key === 'amount' && attr.value !== feeEvent.find((attr) => attr.key === 'fee')?.value
					)
				)[0];
			// Search for event where transfer message means the fee sending
			const transferFeeEvent = transferEvents.find((event) =>
				event.find(
					(attr) => attr.key === 'amount' && attr.value === feeEvent.find((attr) => attr.key === 'fee')?.value
				)
			);
			if (!transferEvent) {
				throw new Error(
					'No transfer event found for fee event with fee payer: ' +
						feeEvent.find((attr) => attr.key === 'fee_payer')?.value
				);
			}
			if (!transferFeeEvent) {
				throw new Error(
					'No transfer event found for fee event with fee: ' +
						feeEvent.find((attr) => attr.key === 'fee')?.value
				);
			}

			const paymentEntity = {
				successful: txResponse.txResponse?.code === 0,
				txHash: txResponse.transactionHash || '',
				fee: parseInt(feeEvent.find((attr) => attr.key === 'fee')?.value || '0'),
				amount: parseInt(transferEvent.find((attr) => attr.key === 'amount')?.value || '0'),
				fromAddress: transferEvent.find((attr) => attr.key === 'recipient')?.value || '',
				toAddress: transferEvent.find((attr) => attr.key === 'sender')?.value || '',
				network: network,
				timestamp: await FeeAnalyzer.getBlockDate(txResponse.transactionHash || '', network),
			} satisfies IFeePaymentOptions;

			paymentEntities.push(paymentEntity);
			transferEvents.splice(transferEvents.indexOf(transferEvent), 1);
			transferEvents.splice(transferEvents.indexOf(transferFeeEvent), 1);
		}

		return paymentEntities;
	}
}
