import type { LinkedResourceMetadataResolutionResult } from '@cheqd/did-provider-cheqd/build/types';
import type { UnsuccessfulQueryResponseBody, UnsuccessfulResponseBody } from './shared.js';

// Positive

export type CreateResourceResponseBody = { resource: LinkedResourceMetadataResolutionResult };

export type QueryResourceResponseBody = any;

// Negative

export type UnsuccessfulCreateResourceResponseBody = UnsuccessfulResponseBody;

export type UnsuccessfulQueryResourceResponseBody = UnsuccessfulQueryResponseBody;
