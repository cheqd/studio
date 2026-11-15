import { requestContext } from './middleware/request-context.js';
import express from 'express';
import Helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { StatusCodes } from 'http-status-codes';
import { CredentialController } from './controllers/api/credential.js';
import { ReceivedCredentialController } from './controllers/api/received-credential.js';
import { AccountController } from './controllers/api/account.js';
import { Authentication } from './middleware/authentication.js';
import { Connection } from './database/connection/connection.js';
import { CredentialStatusController } from './controllers/api/credential-status.js';
import { CORS_ALLOWED_ORIGINS, CORS_ERROR_MSG } from './types/constants.js';
import { LogToWebHook } from './middleware/hook.js';
import { Middleware } from './middleware/middleware.js';
import { jsonBodyParsers } from './middleware/body-parsers.js';
import { customerRateLimiter, ipRateLimiter, rateLimitConfig, trustProxySetting } from './middleware/rate-limit.js';
import * as dotenv from 'dotenv';
// Define Swagger file
import swaggerAPIDocument from './static/swagger-api.json' with { type: 'json' };
import swaggerAdminDocument from './static/swagger-admin.json' with { type: 'json' };
import { PresentationController } from './controllers/api/presentation.js';
import { KeyController } from './controllers/api/key.js';
import { DIDController } from './controllers/api/did.js';
import { ResourceController } from './controllers/api/resource.js';
import { ResponseTracker } from './middleware/event-tracker.js';
import { ProductController } from './controllers/admin/product.js';
import { SubscriptionController } from './controllers/admin/subscriptions.js';
import { PriceController } from './controllers/admin/prices.js';
import { WebhookController } from './controllers/admin/webhook.js';
import { APIKeyController } from './controllers/admin/api-key.js';
import { OrganisationController } from './controllers/admin/organisation.js';
import { FlagsController } from './controllers/api/flags.js';
import { FlagsAdminController } from './controllers/admin/flags.js';
import { CustomersAdminController } from './controllers/admin/customers.js';
import { AnalyticsAdminController } from './controllers/admin/analytics.js';
import { CustomerAnalyticsController } from './controllers/api/customer-analytics.js';
import { AuditLogAdminController } from './controllers/admin/audit-log.js';
import { AgentController } from './controllers/api/agent.js';
import { AccreditationController } from './controllers/api/accreditation.js';
import { OperationController } from './controllers/api/operation.js';
import { ProvidersController } from './controllers/api/providers.controller.js';

dotenv.config();

class App {
	public express: express.Application;
	// Resolves once the DB connect attempt (success or failure) has settled, so index.ts can hold off
	// listening until then — otherwise requests can arrive before the connection is up, failing with
	// TypeORM's "Driver not Connected" instead of a clean retry.
	public dbReady: Promise<void>;

	constructor() {
		this.express = express();
		this.middleware();
		this.routes();
		this.dbReady = Connection.instance
			.connect()
			.then(async () => {
				console.log('Database connection: successful');
				// Seed default providers
				const { seedProviders } = await import('./database/seeds/providers.seed.js');
				await seedProviders();
				// initialize provider factory
				const { initializeProviders } = await import('./services/api/provider.factory.js');
				await initializeProviders();
				console.log('Provider factory initialized');
			})
			.catch((err) => {
				// console.error, not console.log: this is the only place a DB-connect failure surfaces, and
				// some log collectors (including Playwright's webServer by default) only capture stderr.
				console.error('DBConnectorError: ', err);
			});
	}

	private middleware() {
		// Limits run first, so a flood or an oversize body is turned away before any parsing or authentication work.
		const proxySetting = trustProxySetting(process.env.TRUST_PROXY);
		if (proxySetting !== undefined) this.express.set('trust proxy', proxySetting);
		const limits = rateLimitConfig();
		if (limits.enabled) this.express.use(ipRateLimiter(limits));
		for (const { path, handler } of jsonBodyParsers((req, _res, buf) => {
			req.rawBody = buf;
		})) {
			if (path) this.express.use(path, handler);
			else this.express.use(handler);
		}
		this.express.use(express.raw({ type: 'application/octet-stream' }));
		this.express.use(express.urlencoded({ extended: true }));
		this.express.use(Middleware.parseUrlEncodedJson);
		this.express.use(Helmet());
		this.express.use(
			cors({
				origin: function (origin, callback) {
					if (!origin) return callback(null, true);
					const allowedList = CORS_ALLOWED_ORIGINS.split(',');

					for (const allowed of allowedList) {
						if (allowed.indexOf(origin) !== -1) {
							return callback(null, true);
						}
					}
					return callback(new Error(CORS_ERROR_MSG), false);
				},
				// POST /credential/issue returns the credential itself; the Studio record id travels in this header
				exposedHeaders: ['X-Issued-Credential-Id'],
			})
		);
		this.express.use(cookieParser());
		// Request id, timing and the engine-routing log line (engine spec 4.3)
		this.express.use(requestContext);
		const auth = new Authentication();
		// EventTracking
		this.express.use(new ResponseTracker().trackJson);
		// Authentication
		if (process.env.ENABLE_AUTHENTICATION === 'true') {
			this.express.use(
				session({
					secret:
						process.env.COOKIE_SECRET ||
						(function () {
							throw new Error('COOKIE_SECRET is not defined');
						})(),
					cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
					resave: false,
					saveUninitialized: false,
				})
			);
			// Authentication functions/methods
			this.express.use(async (_req, _res, next) => await auth.setup(_res, next));
			this.express.use(async (_req, _res, next) => await auth.wrapperHandleAuthRoutes(_req, _res, next));
			this.express.use(async (_req, _res, next) => await auth.withLogtoWrapper(_req, _res, next));
			if (process.env.ENABLE_EXTERNAL_DB === 'true') {
				this.express.use(async (req, res, next) => await auth.guard(req, res, next));
			}
		}
		// Per-customer limit, once the guard has identified the customer
		if (limits.enabled) this.express.use(customerRateLimiter(limits));
		this.express.use(express.text());
		this.express.use(auth.handleError);
		this.express.use(async (req, res, next) => await auth.accessControl(req, res, next));

		this.express.use('/swagger', swaggerUi.serveFiles(swaggerAPIDocument), swaggerUi.setup(swaggerAPIDocument));
		if (process.env.STRIPE_ENABLED === 'true') {
			this.express.use(
				'/admin/swagger',
				swaggerUi.serveFiles(swaggerAdminDocument),
				swaggerUi.setup(swaggerAdminDocument)
			);
			this.express.use(Middleware.setStripeClient);
		}
	}

	private routes() {
		const app = this.express;

		// Top-level routes
		app.get('/', (_req, res) => res.redirect('swagger'));

		// Credential API
		app.post(`/credential/issue`, CredentialController.issueValidator, new CredentialController().issue);
		app.post(`/credential/verify`, CredentialController.verifyValidator, new CredentialController().verify);
		app.post(`/credential/revoke`, CredentialController.updateValidator, new CredentialController().revoke);
		app.post('/credential/suspend', CredentialController.updateValidator, new CredentialController().suspend);
		app.post('/credential/reinstate', CredentialController.updateValidator, new CredentialController().reinstate);
		// Issued Credentials Tracking API
		app.get('/credentials/issued', new CredentialController().listIssuedCredentials);
		app.get('/credentials/issued/:id', new CredentialController().getIssuedCredential);
		app.put('/credentials/issued/:id', new CredentialController().updateIssuedCredential);
		app.post('/credentials/issued/:id/re-issue', new CredentialController().retryIssuedCredential);
		// Import External Credentials
		app.post(
			'/credentials/import',
			ReceivedCredentialController.importValidator,
			new ReceivedCredentialController().importCredential
		);
		// Received Credentials API
		app.get(
			'/credentials/received',
			ReceivedCredentialController.listReceivedValidator,
			new ReceivedCredentialController().listReceivedCredentials
		);
		app.get(
			'/credentials/received/:credentialHash',
			ReceivedCredentialController.getReceivedValidator,
			new ReceivedCredentialController().getReceivedCredential
		);
		// Credential Offers API
		app.get(
			'/credentials/offers',
			ReceivedCredentialController.listOffersValidator,
			new ReceivedCredentialController().listOffers
		);
		app.get(
			'/credentials/offers/:credentialId',
			ReceivedCredentialController.getOfferValidator,
			new ReceivedCredentialController().getOfferDetails
		);
		app.post(
			'/credentials/offers/:credentialId/accept',
			ReceivedCredentialController.acceptOfferValidator,
			new ReceivedCredentialController().acceptOffer
		);
		app.post(
			'/credentials/offers/:credentialId/reject',
			ReceivedCredentialController.rejectOfferValidator,
			new ReceivedCredentialController().rejectOffer
		);
		// Presentation API
		app.post(
			`/presentation/verify`,
			PresentationController.presentationVerifyValidator,
			new PresentationController().verifyPresentation
		);
		app.post(
			`/presentation/create`,
			PresentationController.presentationCreateValidator,
			new PresentationController().createPresentation
		);

		// Credential status API
		app.post(
			'/credential-status/create/unencrypted',
			CredentialStatusController.createUnencryptedValidator,
			new CredentialStatusController().createUnencryptedStatusList
		);
		app.post(
			'/credential-status/create/encrypted',
			CredentialStatusController.createEncryptedValidator,
			new CredentialStatusController().createEncryptedStatusList
		);
		app.post(
			'/credential-status/update/unencrypted',
			CredentialStatusController.updateUnencryptedValidator,
			new CredentialStatusController().updateUnencryptedStatusList
		);
		app.post(
			'/credential-status/update/encrypted',
			CredentialStatusController.updateEncryptedValidator,
			new CredentialStatusController().updateEncryptedStatusList
		);
		app.post(
			'/credential-status/check',
			CredentialStatusController.checkValidator,
			new CredentialStatusController().checkStatusList
		);
		app.get(
			'/credential-status/search',
			CredentialStatusController.searchValidator,
			new CredentialStatusController().searchStatusList
		);
		app.get(
			'/credential-status/list',
			CredentialStatusController.listValidator,
			new CredentialStatusController().listStatusList
		);
		app.get(
			'/credential-status/list/:statusListId',
			CredentialStatusController.fetchValidator,
			new CredentialStatusController().fetchStatusList
		);

		// Keys API
		app.post('/key/create', new KeyController().createKey);
		app.post('/key/import', KeyController.keyImportValidator, new KeyController().importKey);
		app.get('/key/read/:kid', KeyController.keyGetValidator, new KeyController().getKey);
		app.get(
			'/key/:kid/verification-method',
			KeyController.keyGetValidator,
			new KeyController().convertToVerificationMethod
		);

		// DIDs API
		app.post('/did/create', DIDController.createDIDValidator, new DIDController().createDid);
		app.post('/did/update', DIDController.updateDIDValidator, new DIDController().updateDid);
		app.post('/did/import', DIDController.importDIDValidator, new DIDController().importDid);
		app.post('/did/deactivate/:did', DIDController.didPathValidator, new DIDController().deactivateDid);
		app.get('/did/list', DIDController.listDIDValidator, new DIDController().getDids);
		app.get('/did/search/:did', new DIDController().resolveDidUrl);
		app.post('/did/export/:did', DIDController.didPathValidator, new DIDController().exportDid);

		// Trust Registry API
		app.post(
			'/trust-registry/accreditation/issue',
			AccreditationController.issueValidator,
			new AccreditationController().issue
		);
		app.post(
			'/trust-registry/accreditation/verify',
			AccreditationController.verifyValidator,
			new AccreditationController().verify
		);
		app.post(
			'/trust-registry/accreditation/revoke',
			AccreditationController.publishValidator,
			new AccreditationController().revoke
		);
		app.post(
			'/trust-registry/accreditation/suspend',
			AccreditationController.publishValidator,
			new AccreditationController().suspend
		);
		app.post(
			'/trust-registry/accreditation/reinstate',
			AccreditationController.publishValidator,
			new AccreditationController().reinstate
		);
		app.get(
			'/trust-registry/accreditation/list',
			AccreditationController.listValidator,
			new AccreditationController().listAccreditations
		);

		// Resource API
		app.post(
			'/resource/create/:did',
			ResourceController.createResourceValidator,
			new ResourceController().createResource
		);
		app.get(`/resource/list`, ResourceController.listResourceValidator, new ResourceController().listResources);
		app.get(
			'/resource/search/:did',
			ResourceController.searchResourceValidator,
			new ResourceController().searchResource
		);

		// Events API
		app.get(`/event/list`, OperationController.listOperationValidator, new OperationController().listOperations);

		// Account API
		app.post('/account/create', AccountController.createValidator, new AccountController().create);
		app.post('/account/faucet', AccountController.faucetValidator, new AccountController().requestFaucetTokens);
		app.get('/account', new AccountController().get);
		app.get('/account/idtoken', new AccountController().getIdToken);
		app.get('/account/analytics', new AccountController().getAnalytics);
		const customerAnalytics = new CustomerAnalyticsController();
		app.get(
			'/account/analytics/agents',
			CustomerAnalyticsController.analyticsValidator,
			customerAnalytics.agents.bind(customerAnalytics)
		);
		app.get(
			'/account/analytics/individuals',
			CustomerAnalyticsController.analyticsValidator,
			customerAnalytics.individuals.bind(customerAnalytics)
		);
		app.get('/account/balances', new AccountController().getBalances);
		app.post('/account/export-keys', new AccountController().exportKeys);
		app.delete('/account', new AccountController().delete);

		// LogTo webhooks
		app.post('/account/bootstrap', LogToWebHook.verifyHookSignature, new AccountController().bootstrap);

		// Provider management routes
		app.get('/providers', new ProvidersController().getProviders);
		app.get('/providers/activated', new ProvidersController().getActiveProviders);
		app.get('/providers/:providerId/configuration', new ProvidersController().getProviderConfiguration);
		app.put('/providers/:providerId/configuration', new ProvidersController().updateProviderConfiguration);
		app.post('/providers/:providerId/activate', new ProvidersController().activateProvider);
		app.post('/providers/:providerId/test', new ProvidersController().testConnection);
		app.delete('/providers/:providerId', new ProvidersController().removeProvider);
		app.post(
			'/providers/:providerId/did/import',
			ProvidersController.importDIDValidator,
			new ProvidersController().importDid
		);

		// Agents (migration plan 8.3). The handlers are arrow properties, so they keep their instance when passed on.
		const agents = new AgentController();
		app.post('/agents', AgentController.registerValidator, agents.register);
		app.get('/agents', AgentController.listValidator, agents.list);
		app.get('/agents/:agentId', AgentController.idValidator, agents.get);
		app.patch('/agents/:agentId', AgentController.updateValidator, agents.update);
		app.delete('/agents/:agentId', AgentController.idValidator, agents.remove);
		app.post('/agents/:agentId/card', AgentController.createCardValidator, agents.createCard);
		app.get('/agents/:agentId/card', AgentController.getCardValidator, agents.getCard);
		app.get('/agents/:agentId/authority', AgentController.idValidator, agents.listAuthority);
		app.post('/agents/:agentId/authority', AgentController.grantValidator, agents.grantAuthority);
		app.delete('/agents/:agentId/authority/:grantId', AgentController.revokeValidator, agents.revokeAuthority);
		app.patch('/agents/:agentId/authority/:grantId', AgentController.expiryValidator, agents.changeGrantExpiry);
		app.get('/agents/:agentId/keys', AgentController.idValidator, agents.listKeys);
		app.post('/agents/:agentId/keys', AgentController.addKeyValidator, agents.addKey);
		app.post('/agents/:agentId/keys/rotate', AgentController.rotateKeyValidator, agents.rotateKey);
		app.get('/agents/:agentId/activity', AgentController.activityValidator, agents.activity);
		// x402, Proposed: payment addresses and the read-only settlement view
		app.get('/agents/:agentId/payment-addresses', AgentController.idValidator, agents.listPaymentAddresses);
		app.post(
			'/agents/:agentId/payment-addresses',
			AgentController.bindPaymentAddressValidator,
			agents.bindPaymentAddress
		);
		app.delete(
			'/agents/:agentId/payment-addresses/:bindingId',
			AgentController.revokePaymentAddressValidator,
			agents.revokePaymentAddress
		);
		app.get('/agents/:agentId/settlement', AgentController.idValidator, agents.settlement);

		// Feature flags
		app.get('/flags', new FlagsController().getFlags);
		app.put('/admin/flags', new FlagsAdminController().putFlag);

		// Staff customer back end, analytics and audit log (read only, staff scopes)
		const customersAdmin = new CustomersAdminController();
		const analyticsAdmin = new AnalyticsAdminController();
		const auditAdmin = new AuditLogAdminController();
		app.get('/admin/customers', CustomersAdminController.listValidator, customersAdmin.list.bind(customersAdmin));
		app.get('/admin/customers/:id', CustomersAdminController.getValidator, customersAdmin.get.bind(customersAdmin));
		app.get(
			'/admin/analytics/overview',
			AnalyticsAdminController.overviewValidator,
			analyticsAdmin.overview.bind(analyticsAdmin)
		);
		app.get(
			'/admin/analytics/endpoints',
			AnalyticsAdminController.endpointsValidator,
			analyticsAdmin.endpoints.bind(analyticsAdmin)
		);
		app.get(
			'/admin/analytics/top-accounts',
			AnalyticsAdminController.topAccountsValidator,
			analyticsAdmin.topAccounts.bind(analyticsAdmin)
		);
		app.get('/admin/analytics/plan-mix', analyticsAdmin.planMix.bind(analyticsAdmin));
		app.get(
			'/admin/analytics/faucet-to-ledger',
			AnalyticsAdminController.faucetToLedgerValidator,
			analyticsAdmin.faucetToLedger.bind(analyticsAdmin)
		);
		app.get(
			'/admin/analytics/funnels',
			AnalyticsAdminController.funnelsValidator,
			analyticsAdmin.funnels.bind(analyticsAdmin)
		);
		app.get('/admin/audit-log', AuditLogAdminController.listValidator, auditAdmin.list.bind(auditAdmin));

		// LogTo user info
		app.get('/auth/user-info', async (req, res) => {
			return res.json(req.user);
		});

		// static files
		app.get(
			'/static/custom-button.js',
			express.static(path.join(process.cwd(), '/dist'), { extensions: ['js'], index: false })
		);

		// Portal
		// Product
		if (process.env.STRIPE_ENABLED === 'true') {
			app.get(
				'/admin/product/list',
				ProductController.productListValidator,
				new ProductController().listProducts
			);
			app.get(
				'/admin/product/get/:productId',
				ProductController.productGetValidator,
				new ProductController().getProduct
			);

			// Prices
			app.get('/admin/price/list', PriceController.priceListValidator, new PriceController().getListPrices);

			// Subscription
			app.post(
				'/admin/subscription/create',
				SubscriptionController.subscriptionCreateValidator,
				new SubscriptionController().create
			);
			app.post(
				'/admin/subscription/update',
				SubscriptionController.subscriptionUpdateValidator,
				new SubscriptionController().update
			);
			app.get('/admin/subscription/get', new SubscriptionController().get);
			app.get(
				'/admin/subscription/list',
				SubscriptionController.subscriptionListValidator,
				new SubscriptionController().list
			);
			app.delete(
				'/admin/subscription/cancel',
				SubscriptionController.subscriptionCancelValidator,
				new SubscriptionController().cancel
			);
			app.post(
				'/admin/subscription/resume',
				SubscriptionController.subscriptionResumeValidator,
				new SubscriptionController().resume
			);

			app.get('/admin/checkout/session/:id', new SubscriptionController().getCheckoutSession);

			// API key
			app.post('/admin/api-key/create', APIKeyController.apiKeyCreateValidator, new APIKeyController().create);
			app.post('/admin/api-key/update', APIKeyController.apiKeyUpdateValidator, new APIKeyController().update);
			app.get('/admin/api-key/get', APIKeyController.apiKeyGetValidator, new APIKeyController().get);
			app.get('/admin/api-key/list', APIKeyController.apiKeyListValidator, new APIKeyController().list);
			app.delete('/admin/api-key/revoke', APIKeyController.apiKeyRevokeValidator, new APIKeyController().revoke);

			// Webhook
			app.post('/admin/webhook', new WebhookController().handleWebhook);

			// Customer
			app.post(
				'/admin/organisation/update',
				OrganisationController.organisationUpdatevalidator,
				new OrganisationController().update
			);
			app.get('/admin/organisation/get', new OrganisationController().get);
			app.delete('/admin/organisation/delete', new OrganisationController().delete);
		}

		// 404 for all other requests
		app.all('{*path}', (_req, res) => res.status(StatusCodes.BAD_REQUEST).send('Bad request'));
	}
}

const app = new App();

export default app.express;
export const dbReady = app.dbReady;
