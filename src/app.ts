import express from 'express';
import Helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { StatusCodes } from 'http-status-codes';

import { CredentialController } from './controllers/api/credential.js';
import { AccountController } from './controllers/api/account.js';
import { Authentication } from './middleware/authentication.js';
import { Connection } from './database/connection/connection.js';
import { CredentialStatusController } from './controllers/api/credential-status.js';
import { CORS_ALLOWED_ORIGINS, CORS_ERROR_MSG } from './types/constants.js';
import { LogToWebHook } from './middleware/hook.js';
import { Middleware } from './middleware/middleware.js';

import * as dotenv from 'dotenv';
dotenv.config();

// Define Swagger file
import swaggerAPIDocument from './static/swagger-api.json' assert { type: 'json' };
import swaggerAdminDocument from './static/swagger-admin.json' assert { type: 'json' };
import { PresentationController } from './controllers/api/presentation.js';
import { KeyController } from './controllers/api/key.js';
import { DIDController } from './controllers/api/did.js';
import { ResourceController } from './controllers/api/resource.js';
import { ResponseTracker } from './middleware/event-tracker.js';
import { ProductController } from './controllers/admin/product.js';
import { SubscriptionController } from './controllers/admin/subscriptions.js';
import { PriceController } from './controllers/admin/prices.js';
import { WebhookController } from './controllers/admin/webhook.js';

let swaggerOptions = {};
if (process.env.ENABLE_AUTHENTICATION === 'true') {
	swaggerOptions = {
		customJs: '/static/custom-button.js',
	};
}

class App {
	public express: express.Application;

	constructor() {
		this.express = express();
		this.middleware();
		this.routes();
		Connection.instance.connect();
	}

	private middleware() {
		this.express.use(
			express.json({
				limit: '50mb',
				verify: (req: express.Request & { rawBody: Buffer }, _res, buf) => {
					req.rawBody = buf;
				},
			})
		);
		this.express.use(express.raw({ type: 'application/octet-stream' }));
		this.express.use(express.urlencoded({ extended: true }));
		this.express.use(Middleware.parseUrlEncodedJson);
		this.express.use(Helmet());
		this.express.use(
			cors({
				origin: function (origin, callback) {
					if (!origin) return callback(null, true);
					if (CORS_ALLOWED_ORIGINS?.indexOf(origin) === -1) {
						return callback(new Error(CORS_ERROR_MSG), false);
					}
					return callback(null, true);
				},
			})
		);
		this.express.use(cookieParser());
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
			this.express.use(async (_req, _res, next) => await auth.setup(next));
			this.express.use(async (_req, _res, next) => await auth.wrapperHandleAuthRoutes(_req, _res, next));
			this.express.use(async (_req, _res, next) => await auth.withLogtoWrapper(_req, _res, next));
			if (process.env.ENABLE_EXTERNAL_DB === 'true') {
				this.express.use(async (req, res, next) => await auth.guard(req, res, next));
			}
		}
		this.express.use(express.text());

		this.express.use(
			'/swagger',
			swaggerUi.serveFiles(swaggerAPIDocument, swaggerOptions),
			swaggerUi.setup(swaggerAPIDocument, swaggerOptions)
		);
		if (process.env.STRIPE_ENABLED === 'true') {
			this.express.use(
				'/admin/swagger',
				swaggerUi.serveFiles(swaggerAdminDocument),
				swaggerUi.setup(swaggerAdminDocument)
			);
			this.express.use(Middleware.setStripeClient);
		}
		this.express.use(auth.handleError);
		this.express.use(async (req, res, next) => await auth.accessControl(req, res, next));
	}

	private routes() {
		const app = this.express;

		// Top-level routes
		app.get('/', (_req, res) => res.redirect('swagger'));

		// Credential API
		app.post(`/credential/issue`, CredentialController.issueValidator, new CredentialController().issue);
		app.post(`/credential/verify`, CredentialController.verifyValidator, new CredentialController().verify);
		app.post(`/credential/revoke`, CredentialController.revokeValidator, new CredentialController().revoke);
		app.post('/credential/suspend', CredentialController.suspendValidator, new CredentialController().suspend);
		app.post(
			'/credential/reinstate',
			CredentialController.reinstateValidator,
			new CredentialController().reinstate
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

		// Keys API
		app.post('/key/create', new KeyController().createKey);
		app.post('/key/import', KeyController.keyImportValidator, new KeyController().importKey);
		app.get('/key/read/:kid', new KeyController().getKey);

		// DIDs API
		app.post('/did/create', DIDController.createDIDValidator, new DIDController().createDid);
		app.post('/did/update', DIDController.updateDIDValidator, new DIDController().updateDid);
		app.post('/did/import', DIDController.importDIDValidator, new DIDController().importDid);
		app.post('/did/deactivate/:did', DIDController.deactivateDIDValidator, new DIDController().deactivateDid);
		app.get('/did/list', new DIDController().getDids);
		app.get('/did/search/:did', new DIDController().resolveDidUrl);

		// Resource API
		app.post(
			'/resource/create/:did',
			ResourceController.createResourceValidator,
			new ResourceController().createResource
		);
		app.get(
			'/resource/search/:did',
			ResourceController.searchResourceValidator,
			new ResourceController().searchResource
		);

		// Account API
		app.post('/account/create', AccountController.createValidator, new AccountController().create);
		app.get('/account', new AccountController().get);
		app.get('/account/idtoken', new AccountController().getIdToken);

		// LogTo webhooks
		app.post('/account/bootstrap', LogToWebHook.verifyHookSignature, new AccountController().bootstrap);

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

			// Webhook
			app.post('/admin/webhook', new WebhookController().handleWebhook);
		}

		// 404 for all other requests
		app.all('*', (_req, res) => res.status(StatusCodes.BAD_REQUEST).send('Bad request'));
	}
}

export default new App().express;
