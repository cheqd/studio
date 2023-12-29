import type { ManagedKeyInfo } from '@veramo/core';
import type { KeyEntity } from '../database/entities/key.entity.js';
import type { UnsuccessfulQueryResponseBody, UnsuccessfulResponseBody } from './shared.js';

// Positive

export type CreateKeyResponseBody = KeyEntity;

export type ImportKeyResponseBody = KeyEntity;

export type QueryKeyResponseBody = ManagedKeyInfo;

//Negative

export type UnsuccessfulCreateKeyResponseBody = UnsuccessfulResponseBody;

export type UnsuccessfulImportKeyResponseBody = UnsuccessfulResponseBody;

export type UnsuccessfulQueryKeyResponseBody = UnsuccessfulQueryResponseBody;
