
import type { ValidationErrorResponseBody } from '../../types/shared.js';
import { Request, Response } from 'express';
import { validationResult } from './index.js';
import { StatusCodes } from 'http-status-codes';

export function validate(target: any, key: string, descriptor: PropertyDescriptor | undefined) {
 
    // save a reference to the original method this way we keep the values currently in the
    // descriptor and don't overwrite what another decorator might have done to the descriptor.
    if(descriptor === undefined) {
      descriptor = Object.getOwnPropertyDescriptor(target, key) as PropertyDescriptor;
    }

    const originalMethod = descriptor.value;
 
    //editing the descriptor/value parameter
    descriptor.value = async function (...args: any[]) {
        const request: Request = args[0];
		const response: Response = args[1];
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: result.array().pop()?.msg,
			} satisfies ValidationErrorResponseBody);
		}
		return originalMethod.apply(this, args);
    };
 
    // return edited descriptor as opposed to overwriting the descriptor
    return descriptor;
}