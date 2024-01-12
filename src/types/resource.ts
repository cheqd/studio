import type { LinkedResourceMetadataResolutionResult } from '@cheqd/did-provider-cheqd/build/types';
import type { UnsuccessfulQueryResponseBody, UnsuccessfulResponseBody } from './shared.js';
import type { DIDRequest } from './did.js';
import type { CheqdNetwork } from '@cheqd/sdk';
import type { AlternativeUri } from '@cheqd/ts-proto/cheqd/resource/v2/resource.js';
import type { SupportedEncodings } from 'uint8arrays';

// Requests
export type CreateResourceRequestParams = DIDRequest;

export type CreateResourceRequestBody = {
    data: string,
    encoding: SupportedEncodings,
    name: string,
    type: string,
    network: CheqdNetwork.Mainnet | CheqdNetwork.Testnet,
    alsoKnownAs?: AlternativeUri[],
    version?: string,
}

export type SearchResourceRequestParams = DIDRequest;

// Positive

export type CreateResourceResponseBody = { resource: LinkedResourceMetadataResolutionResult };

export type QueryResourceResponseBody = any;

// Negative

export type UnsuccessfulCreateResourceResponseBody = UnsuccessfulResponseBody;

export type UnsuccessfulQueryResourceResponseBody = UnsuccessfulQueryResponseBody;
