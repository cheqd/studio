import { backOff, type BackoffOptions } from 'exponential-backoff';

export async function retry<T>(fn: () => Promise<T>, options?: BackoffOptions ): Promise<T | undefined> {
    // set default options
    if (!options) {
        options = {
            startingDelay: 1000,
            timeMultiple: 2.5,
            jitter: 'full',
            numOfAttempts: 20,
        };
    }

    let result: T | undefined;

    try {
        result = await backOff(fn, options);
    } catch (e) {
        console.error(e);
    }

    return result;
}
