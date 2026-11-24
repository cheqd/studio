import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { getRepository: () => ({}) } } },
}));

// DockApiService reads its master key when the module loads; a placeholder is enough for these tests
process.env.DOCK_MASTER_API_KEY ||= 'placeholder-not-a-key';

const { checkProviderEndpoint, checkProviderWebhookUrl, allowedProviderHosts } =
	await import('../../../src/helpers/provider-endpoint.js');
const { ProvidersController } = await import('../../../src/controllers/api/providers.controller.js');
const { ProviderService } = await import('../../../src/services/api/provider.service.js');
const { DockApiService } = await import('../../../src/services/api/providers/dock-api.service.js');

const PROD = { NODE_ENV: 'production', APPLICATION_BASE_URL: 'https://studio.example.net' };
const DEV = { NODE_ENV: 'development', APPLICATION_BASE_URL: 'http://localhost:3000' };

describe('provider endpoint allow-list', () => {
	it.each([
		'https://api.creds.xyz',
		'https://api-testnet.truvera.io/v1',
		'https://api.truvera.io',
		'https://api.hovi.id',
		'https://api.paradym.id',
		'https://studio.example.net/api',
	])('accepts %s', (url) => {
		expect(checkProviderEndpoint(url, PROD)).toEqual({ ok: true });
	});

	it.each([
		['plain http', 'http://api.hovi.id'],
		['an unknown host', 'https://collector.example.org'],
		['a look-alike host', 'https://api.hovi.id.example.org'],
		['credentials in the URL', 'https://user:pass@api.hovi.id'],
		['loopback outside development', 'http://localhost:3000'],
		['loopback over https outside development', 'https://127.0.0.1'],
		['a cloud metadata address', 'http://169.254.169.254/latest/meta-data'],
		['something that is not a URL', 'api.hovi.id'],
	])('refuses %s', (_label, url) => {
		expect(checkProviderEndpoint(url, PROD).ok).toBe(false);
	});

	it('no longer skips the check because APPLICATION_BASE_URL mentions localhost', () => {
		const misconfigured = { NODE_ENV: 'production', APPLICATION_BASE_URL: 'http://localhost:3000' };
		expect(checkProviderEndpoint('https://collector.example.org', misconfigured).ok).toBe(false);
		expect(checkProviderEndpoint('http://localhost:3000', misconfigured).ok).toBe(false);
		expect(allowedProviderHosts(misconfigured).has('localhost')).toBe(false);
	});

	it('accepts loopback over http only in development and test', () => {
		expect(checkProviderEndpoint('http://localhost:3000', DEV)).toEqual({ ok: true });
		expect(checkProviderEndpoint('http://127.0.0.1:3000', { NODE_ENV: 'test' })).toEqual({ ok: true });
		expect(checkProviderEndpoint('http://localhost:3000', {})).toMatchObject({ ok: false });
		expect(checkProviderEndpoint('https://collector.example.org', DEV).ok).toBe(false);
	});

	it('adds the hosts listed in PROVIDER_ENDPOINT_ALLOWED_HOSTS', () => {
		const env = { ...PROD, PROVIDER_ENDPOINT_ALLOWED_HOSTS: ' Sandbox.Provider.example , other.example ' };
		expect(checkProviderEndpoint('https://sandbox.provider.example', env)).toEqual({ ok: true });
		expect(checkProviderEndpoint('https://other.example', env)).toEqual({ ok: true });
		expect(checkProviderEndpoint('http://other.example', env).ok).toBe(false);
	});

	it('requires https webhook URLs, with loopback allowed only in development', () => {
		expect(checkProviderWebhookUrl('https://hooks.example.org/x', PROD)).toEqual({ ok: true });
		expect(checkProviderWebhookUrl('http://hooks.example.org/x', PROD).ok).toBe(false);
		expect(checkProviderWebhookUrl('http://localhost:4000/hook', PROD).ok).toBe(false);
		expect(checkProviderWebhookUrl('http://localhost:4000/hook', DEV)).toEqual({ ok: true });
	});
});

describe('provider routes apply the allow-list', () => {
	const savedEnv = { NODE_ENV: process.env.NODE_ENV, APPLICATION_BASE_URL: process.env.APPLICATION_BASE_URL };
	afterEach(() => {
		process.env.NODE_ENV = savedEnv.NODE_ENV as never;
		process.env.APPLICATION_BASE_URL = savedEnv.APPLICATION_BASE_URL;
		jest.restoreAllMocks();
	});

	const makeResponse = () => ({
		locals: { customer: { customerId: 'customer-1' } },
		statusCode: 200,
		body: undefined as unknown,
		status(code: number) {
			this.statusCode = code;
			return this;
		},
		json(body: unknown) {
			this.body = body;
			return this;
		},
	});

	it('refuses to store an endpoint on another host, even when APPLICATION_BASE_URL is localhost', async () => {
		process.env.NODE_ENV = 'production' as never;
		process.env.APPLICATION_BASE_URL = 'http://localhost:3000';
		const update = jest.spyOn(ProviderService.instance, 'updateProviderConfiguration');
		const response = makeResponse();
		const request = {
			params: { providerId: 'dock' },
			body: { apiEndpoint: 'https://collector.example.org' },
		} as unknown as Request;
		await new ProvidersController().updateProviderConfiguration(request, response as unknown as Response);
		expect(response.statusCode).toBe(400);
		expect(update).not.toHaveBeenCalled();
	});

	it('refuses to test a connection against an endpoint on another host', async () => {
		process.env.NODE_ENV = 'production' as never;
		const test = jest.spyOn(ProviderService.instance, 'testConnection');
		const response = makeResponse();
		const request = {
			params: { providerId: 'dock' },
			query: { newAPIUrl: 'https://collector.example.org' },
		} as unknown as Request;
		await new ProvidersController().testConnection(request, response as unknown as Response);
		expect(response.statusCode).toBe(400);
		expect(test).not.toHaveBeenCalled();
	});

	it('does not send the provider key to a stored endpoint that is not allowed', async () => {
		process.env.NODE_ENV = 'production' as never;
		const fetchSpy = jest.spyOn(globalThis, 'fetch');
		jest.spyOn(ProviderService.instance, 'getDecryptedApiKey').mockResolvedValue('provider-key');
		const result = await DockApiService.instance.testProviderConfiguration({
			apiEndpoint: 'https://collector.example.org',
			defaultSettings: {},
		} as never);
		expect(result.success).toBe(false);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
