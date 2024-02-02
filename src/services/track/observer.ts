import type { LinkedResourceMetadataResolutionResult } from '@cheqd/did-provider-cheqd';
import { OperationNameEnum, OperationCategoryNameEnum } from '../../types/constants.js';
import { ICredentialStatusTrack, ICredentialTrack, IResourceTrack, isCredentialStatusTrack, isCredentialTrack, isResourceTrack, type ITrackOperation, type ITrackResult } from '../../types/track.js';
import { IdentifierService } from '../identifier.js';
import { KeyService } from '../key.js';
import { OperationService } from '../operation.js';
import { ResourceService } from '../resource.js';
import { TrackNotifier, ITrackSubject } from './tracker.js';

export type ITrackType = ITrackOperation | ITrackResult;

export interface IObserver {
	update(operation: ITrackType): Promise<ITrackResult>;
}

export class BaseOperationObserver implements IObserver {

    protected notifier: ITrackSubject

    constructor(notifier?: ITrackSubject) {
        this.notifier = notifier || new TrackNotifier()
    }

    async update(trackOperation: ITrackOperation): Promise<ITrackResult> {
        throw new Error('Method not implemented.')
    }

}

export class DBOperationObserver extends BaseOperationObserver implements IObserver {
    async update(trackOperation: ITrackOperation): Promise<ITrackResult> {
        // tracking operation in our DB. It handles all the operations
        const result = await this.trackOperation(trackOperation)
        // notify about the result of tracking, e.g. log or datadog
        this.notifier.notify(result)
        // 
        return result
    }

    async trackOperation(trackOperation: ITrackOperation): Promise<ITrackResult> {
        try {
            const result = OperationService.instance.create(
                trackOperation.category,
                trackOperation.name,
                trackOperation.feePaymentOptions?.feePaymentAmount || 0,
                false
            )

            if (!result) {
                throw new Error(`Operation ${trackOperation.name} was not written to DB`)
            }
            return {
                tracked: true,
                operation: trackOperation,
                message: `Information about operation ${trackOperation.name} was successfully written to DB`,
                error: '',
            }
        } catch (error) {
            return {
                tracked: false,
                operation: trackOperation,
                error: `Error while writing information about operation ${trackOperation.name} to DB: ${(error as Error)?.message || error}`,
            }
        }
    }
}

export class ResourceObserver extends BaseOperationObserver implements IObserver {

    private static acceptedOperations = [
        OperationNameEnum.RESOURCE_CREATE,
        OperationNameEnum.CREDENTIAL_REVOKE,
        OperationNameEnum.CREDENTIAL_SUSPEND,
        OperationNameEnum.CREDENTIAL_UNSUSPEND,
        OperationNameEnum.CREDENTIAL_STATUS_CREATE_UNENCRYPTED,
        OperationNameEnum.CREDENTIAL_STATUS_CREATE_ENCRYPTED,
        OperationNameEnum.CREDENTIAL_STATUS_UPDATE_UNENCRYPTED,
        OperationNameEnum.CREDENTIAL_STATUS_UPDATE_ENCRYPTED,
    ];

    isReactionNeeded(trackOperation: ITrackOperation): boolean {
        // Resource tracker reacts on CredentialStatusList, Credential operations like revocation 
        // and Resource operations like create, update, delete
        const isCategoryAccepted = trackOperation.category === OperationCategoryNameEnum.RESOURCE ||
            trackOperation.category === OperationCategoryNameEnum.CREDENTIAL ||
            trackOperation.category === OperationCategoryNameEnum.CREDENTIAL_STATUS
        const isOperationAccepted = ResourceObserver.acceptedOperations.includes(trackOperation.name as OperationNameEnum)
        return isCategoryAccepted && isOperationAccepted
    }

    async update(trackOperation: ITrackOperation): Promise<ITrackResult> {
        if (this.isReactionNeeded(trackOperation)) {
            // Just skip this operation
            return {
                tracked: true,
                operation: trackOperation
            } satisfies ITrackResult
        }
        // tracking resource creation in DB
        const result = await this.trackResourceOperation(trackOperation)
        // notify about the result of tracking, e.g. log or datadog
        this.notifier.notify(result)
        return result
    }

    async trackResourceOperation(trackOperation: ITrackOperation): Promise<ITrackResult> {
        // Resource operation may be with CredentialStatusList or with Credential operations like revocation 
        // and others and also with Resource operations like create, update, delete
        const customer = trackOperation.customer
        const did = trackOperation.did
        const data = trackOperation.data
        let encrypted = false
        let symmetricKey = ''
		let resource: LinkedResourceMetadataResolutionResult | undefined = undefined;

        if (isResourceTrack(data)) {
            encrypted = false
            symmetricKey = ''
			resource = (data as IResourceTrack).resource
        }
        if (isCredentialStatusTrack(data)) {
            encrypted = (data as ICredentialStatusTrack).encrypted
            symmetricKey = (data as ICredentialStatusTrack).symmetricKey || ''
			resource = (data as ICredentialStatusTrack).resource
        }
        if (isCredentialTrack(data)) {
            encrypted = (data as ICredentialTrack).encrypted
            symmetricKey = (data as ICredentialTrack).symmetricKey || ''
			resource = (data as ICredentialTrack).resource
        }

		if (!resource) {
			return {
				tracked: false,
				operation: trackOperation,
				error: `Resource for ${did} was not specified`,
			}
		}

        const identifier = await IdentifierService.instance.get(did)
        if (!identifier) {
            throw new Error(`Identifier ${did} not found`)
        }
        if (!identifier.controllerKeyId) {
            throw new Error(`Identifier ${did} does not have link to the controller key...`)
        }
        const key = await KeyService.instance.get(identifier.controllerKeyId)
        if (!key) {
            throw new Error(`Key for ${did} not found`)
        }

        const resourceEntity = await ResourceService.instance.createFromLinkedResource(
            resource,
            customer,
            key,
            identifier,
            encrypted,
            symmetricKey
        )
        if (!resourceEntity) {
            return {
                tracked: false,
                operation: trackOperation,
                error: `Resource for ${did} was not tracked`,
            }
        }
        return {
            tracked: true,
            operation: trackOperation,
            error: '',
        }
    }
}

export class CredentialObserver extends BaseOperationObserver implements IObserver {

    isReactionNeeded(trackOperation: ITrackOperation): boolean {
        // Credential tracker reacts on CredentialStatusList, Credential operations like revocation 
        // and Resource operations like create, update, delete
        return trackOperation.category === OperationCategoryNameEnum.CREDENTIAL
    }

    async update(trackOperation: ITrackOperation): Promise<ITrackResult> {
        if (this.isReactionNeeded(trackOperation)) {
            // Just skip this operation
            return {
                tracked: true,
                operation: trackOperation
            } satisfies ITrackResult
        }
        // tracking resource creation in DB
        const result = await this.trackCredentialOperation(trackOperation)
        // notify about the result of tracking, e.g. log or datadog
        this.notifier.notify(result)
        return result
    }

    async trackCredentialOperation(trackOperation: ITrackOperation): Promise<ITrackResult> {
        // We don't have specific credential status writes, so we just track credential creation
        return {
            tracked: true,
            operation: trackOperation,
            error: '',
        } satisfies ITrackResult
    }

}

export class DIDObserver extends BaseOperationObserver implements IObserver {
    isReactionNeeded(trackOperation: ITrackOperation): boolean {
        // Credential tracker reacts on CredentialStatusList, Credential operations like revocation 
        // and Resource operations like create, update, delete
        return trackOperation.category === OperationCategoryNameEnum.DID
    }

    async update(trackOperation: ITrackOperation): Promise<ITrackResult> {
        if (this.isReactionNeeded(trackOperation)) {
            // Just skip this operation
            return {
                tracked: true,
                operation: trackOperation
            } satisfies ITrackResult
        }
        // tracking resource creation in DB
        const result = await this.trackDIDOperation(trackOperation)
        // notify about the result of tracking, e.g. log or datadog
        this.notifier.notify(result)
        return result
    }

    async trackDIDOperation(trackOperation: ITrackOperation): Promise<ITrackResult> {
        // We don't have specific DID related operations to track
        return {
            tracked: true,
            operation: trackOperation,
            error: '',
        } satisfies ITrackResult
    }
}

export class CredentialStatusObserver extends BaseOperationObserver implements IObserver {

    isReactionNeeded(trackOperation: ITrackOperation): boolean {
        // Credential tracker reacts on CredentialStatusList, Credential operations like revocation 
        // and Resource operations like create, update, delete
        return trackOperation.category === OperationCategoryNameEnum.CREDENTIAL_STATUS
    }

    async update(trackOperation: ITrackOperation): Promise<ITrackResult> {
        if (this.isReactionNeeded(trackOperation)) {
            // Just skip this operation
            return {
                tracked: true,
                operation: trackOperation
            } satisfies ITrackResult
        }
        // tracking resource creation in DB
        const result = await this.trackCredentialStatusOperation(trackOperation)
        // notify about the result of tracking, e.g. log or datadog
        this.notifier.notify(result)
        return result
    }

    async trackCredentialStatusOperation(trackOperation: ITrackOperation): Promise<ITrackResult> {
        // We don't have specific credential status writes, so we just track credential creation
        return {
            tracked: true,
            operation: trackOperation,
            error: '',
        } satisfies ITrackResult
    }

}
