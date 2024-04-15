import * as dotenv from 'dotenv';
import type { ICommonErrorResponse } from '../../types/authentication.js';
dotenv.config();

// Simple interface for building the response/result
export interface IReturn {
	returnOk(): ICommonErrorResponse;
	returnError(status: number, error: string): ICommonErrorResponse;
}
