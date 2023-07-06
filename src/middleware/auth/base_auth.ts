import { Request, Response } from "express";
import * as dotenv from 'dotenv'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import stringify from 'json-stringify-safe'
import { cheqdDidRegex } from '../../types/types.js'
import { MethodToScope, IAuthResourceHandler, Namespaces, IAuthResponse } from '../../types/authentication.js'
import { IncomingHttpHeaders } from "http";
import { LogToHelper } from "./logto.js";

dotenv.config()

const {
    LOGTO_ENDPOINT,
    LOGTO_DEFAULT_RESOURCE_URL,
} = process.env

// Constants
const OIDC_ISSUER = LOGTO_ENDPOINT + '/oidc'
const OIDC_JWKS_ENDPOINT = LOGTO_ENDPOINT + '/oidc/jwks'
const bearerTokenIdentifier = 'Bearer'


export abstract class AbstractAuthHandler implements IAuthResourceHandler
{
    private nextHandler: IAuthResourceHandler
    private namespace: Namespaces
    private token: string
    private scopes: string[] | unknown
    private logToHelper: LogToHelper

    public customer_id: string

    private routeToScoupe: MethodToScope[] = []
    private static pathSkip = ['/swagger', '/user', '/static', '/logto', '/account/set-default-role']
    // private static regExpSkip = new RegExp("^/.*js")

    constructor () {
        this.nextHandler = {} as IAuthResourceHandler
        this.namespace = '' as Namespaces
        this.token = '' as string
        this.scopes = undefined
        this.customer_id = '' as string
        this.logToHelper = new LogToHelper()
    }

    public async commonPermissionCheck(request: Request): Promise<IAuthResponse> {
        // Tries to get token from the request and other preps
        const _setup = this.setupAuth(request)
        if (_setup) {
            return _setup
        }

        const resourceAPI = AbstractAuthHandler.buildResourceAPIUrl(request)
        if (!resourceAPI) {
            return {
                status: 500,
                error: `Internal error. Issue with building resource API for the path ${request.path}`,
                data: {
                    customerId: '',
                    scopes: [],
                    namespace: this.getNamespace(),
                }

            }
        }
        // Verifies token for the resource API
        const _resp = await this.verifyJWTToken(this.getToken(), resourceAPI)
        if (_resp && _resp.status !== 200) {
            return _resp
        }

        // Checks if the token has the required scopes
        if (!this.areValidScopes(request.path, request.method, this.getScopes() as string[], this.getNamespace())) {
            return {
                status: 400,
                error: `Unauthorized error: Current LogTo account does not have the required scopes. 
                You need ${this.getScopeForRoute(request.path, request.method, this.getNamespace())} scope(s).`,
                data: {
                    customerId: '',
                    scopes: [],
                    namespace: this.getNamespace(),
                }

            }
        }
        return {
            status: 200,
            error: '',
            data: {
                customerId: this.getCustomerId(),
                scopes: this.getScopes() as string[],
                namespace: this.getNamespace(),
            }
        }
    }

    public async setup() {
        await this.logToHelper.setup()
    }

    // interface implementation
    public setNext(handler: IAuthResourceHandler): IAuthResourceHandler {
        this.nextHandler = handler;
        return handler
    }

    public async handle(request: Request, response: Response): Promise<IAuthResponse> {
        if (Object.keys(this.nextHandler).length !== 0) {
            return this.nextHandler.handle(request, response)
        }
        // If request.path was not registered in the routeToScope, then skip the auth check
        return {
            status: 200,
            error: '',
            data: {
                customerId: '',
                scopes: [],
                namespace: this.getNamespace(),
            }
        }
    }

    public skipPath(path: string): boolean {
        for (const ps of AbstractAuthHandler.pathSkip) {
            if (path === "/" || path.startsWith(ps)) {
                return true
            }
        }
        return false
    }

    // Verifies the JWT token for resourceAPI
    public async verifyJWTToken(token: string, resourceAPI: string): Promise<IAuthResponse | void> {
        try {
            const { payload } = await jwtVerify(
                token, // The raw Bearer Token extracted from the request header
                createRemoteJWKSet(new URL(OIDC_JWKS_ENDPOINT)), // generate a jwks using jwks_uri inquired from Logto server
                {
                    // expected issuer of the token, should be issued by the Logto server
                    issuer: OIDC_ISSUER,
                    // expected audience token, should be the resource indicator of the current API
                    audience: resourceAPI,
                }
            )
            // Setup the scopes from the token
            if (!payload.scope) {
                return {
                    status: 400,
                    error: `Unauthorized error: No scope found in the token.`,
                    data: {
                        customerId: '',
                        scopes: [],
                        namespace: this.namespace
                    }

                }
            }
            this.scopes = (payload.scope as string).split(' ')
            this.customer_id = payload.sub as string

        } catch (error) {
            return {
                status: 400,
                error: `Unauthorized error: ${error}`,
                data: {
                    customerId: '',
                    scopes: [],
                    namespace: this.namespace
                }

            }
        }
    }

    // Make all the possible preps for the auth handler
    public setupAuth(request: Request): IAuthResponse | void {
        // setting up namespace. It should be testnet or mainnet
        this.namespace = AbstractAuthHandler.getNamespaceFromRequest(request)

        // getting the accessToken from the request
        // Firstly try to get it from the headers
        let token: string = AbstractAuthHandler.extractBearerTokenFromHeaders(request.headers) as string
        if (!token) {
            // Otherwise try to get it from the user structure in the request
            token = Object.getOwnPropertyNames(request.user).length > 0 ? request.user.accessToken as string : "";
            if (!token) {
                return {
                    status: 401,
                    error: `Unauthorized error: Looks like you are not logged in using LogTo properly.`,
                    data: {
                        customerId: '',
                        scopes: [],
                        namespace: this.namespace
                    }

                }
            }
        }
        this.token = token
    }

    // common utils
    public static getNamespaceFromRequest(req: Request): Namespaces {
        const matches = stringify(req.body).match(cheqdDidRegex)
        if (matches && matches.length > 0) {
            if (Namespaces.Mainnet === matches[0]) {
                return Namespaces.Mainnet
            }
        }
        return Namespaces.Testnet
    }

    public static buildResourceAPIUrl(request: Request): string {
        const api_root = request.path.split('/')[1]
        if (!api_root) {
            // Skip if no api root
            return ""
        }
        return `${LOGTO_DEFAULT_RESOURCE_URL}/${api_root}`
    }

    public static extractBearerTokenFromHeaders({ authorization }: IncomingHttpHeaders): string | unknown {

        if (authorization && authorization.startsWith(bearerTokenIdentifier)) {
            return authorization.slice(bearerTokenIdentifier.length + 1)
        }
      
        return undefined
    }

    // Getters
    public getNamespace(): Namespaces {
        return this.namespace
    }

    public getToken(): string {
        return this.token
    }

    public getScopes(): string[] | unknown {
        return this.scopes
    }

    public getCustomerId(): string {
        return this.customer_id
    }

    public getAllLogToScopes(): string[] | void {
        if (this.logToHelper) {
            return this.logToHelper.getAllScopes()
        }
    }

    public getDefaultLogToScopes(): string[] | void {
        if (this.logToHelper) {
            return this.logToHelper.getDefaultScopes()
        }
    }

    public getAllLogToResources(): string[] | void {
        if (this.logToHelper) {
            return this.logToHelper.getAllResourcesWithNames()
        }
    }

    // Route and scope related funcs
    public registerRoute(route: string, method: string, scope: string): void {
        this.routeToScoupe.push(new MethodToScope(route, method, scope))
    }

    private findRule(route: string, method: string, namespace=Namespaces.Testnet): MethodToScope | null {
        for (const item of this.routeToScoupe) {
            if (item.isRule(route, method, namespace)) {
                return item
            }
        }
        return null
    }

    public getScopeForRoute(route: string, method: string, namespace=Namespaces.Testnet): string | null {
        const rule = this.findRule(route, method, namespace)
        if (rule) {
            return rule.getScope()
        }
        return null
    }

    public isValidScope(route: string, method: string, scope: string, namespace=Namespaces.Testnet): boolean {
        const rule = this.findRule(route, method, namespace)
        if (rule) {
            return rule.validate(route, method, scope, namespace)
        }
        // If no rule for route, then allow
        return true
    }

    public areValidScopes(route: string, method: string, scopes: string[], namespace=Namespaces.Testnet): boolean {
        for (const scope of scopes) {
            if (this.isValidScope(route, method, scope, namespace)) {
                return true
            }
        }
        return false
    }
}