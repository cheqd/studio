import { describe, expect, it, jest } from '@jest/globals';
import { enforceAskarNative, verifyAskarNative } from '../../../../src/services/identity/engine/credo/askar-native.js';

// The probe is always injected here: the real one would evaluate the native module (docs/testing-askar.md)
describe('verifyAskarNative', () => {
	it('reports the version when the native library answers', async () => {
		const probe = jest.fn(async () => '0.4.5');
		await expect(verifyAskarNative(probe)).resolves.toEqual({ ok: true, version: '0.4.5' });
		expect(probe).toHaveBeenCalledTimes(1);
	});

	it('refuses with a one-line reason naming LIB_ASKAR_PATH when the binary is missing', async () => {
		const probe = async () => {
			throw new Error('Could not find aries_askar with these paths:\n/usr/lib/libaries_askar.dylib');
		};
		const result = await verifyAskarNative(probe);
		expect(result.ok).toBe(false);
		const reason = (result as { reason: string }).reason;
		expect(reason).toContain('LIB_ASKAR_PATH');
		expect(reason).toContain('Could not find aries_askar');
		expect(reason).not.toContain('\n');
	});

	it('does not throw when the check itself throws something that is not an Error', async () => {
		const result = await verifyAskarNative(async () => {
			throw 'segfault-ish';
		});
		expect(result).toEqual({
			ok: false,
			reason: 'Askar native library is missing or incompatible: check LIB_ASKAR_PATH first (segfault-ish)',
		});
	});
});

describe('enforceAskarNative', () => {
	it('lets the boot continue when the binary is fine', async () => {
		const exit = jest.fn();
		const log = jest.fn();
		await enforceAskarNative({ probe: async () => '0.4.5', log, exit });
		expect(exit).not.toHaveBeenCalled();
		expect(log).not.toHaveBeenCalled();
	});

	it('logs the reason once and exits 1 when the binary is missing', async () => {
		const exit = jest.fn();
		const log = jest.fn();
		await enforceAskarNative({
			probe: async () => {
				throw new Error('Could not find aries_askar');
			},
			log,
			exit,
		});
		expect(log).toHaveBeenCalledTimes(1);
		expect(String(log.mock.calls[0][0])).toContain('LIB_ASKAR_PATH');
		expect(exit).toHaveBeenCalledWith(1);
	});
});
