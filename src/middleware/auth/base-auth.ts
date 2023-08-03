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
    private scopes: string[]
    private logToHelper: LogToHelper

    public customerId: string

    private routeToScoupe: MethodToScope[] = []
    private static pathSkip = [
        '/swagger', 
        '/user', 
        '/static', 
        '/logto', 
        '/account/set-default-role']

    constructor () {
        this.nextHandler = {} as IAuthResourceHandler
        this.namespace = '' as Namespaces
        this.token = '' as string
        this.scopes = []
        this.customerId = '' as string
        this.logToHelper = new LogToHelper()
    }

    public async commonPermissionCheck(request: Request): Promise<IAuthResponse> {
        // Firstly - try to find the rule for the request
        const rule = this.findRule(request.path, request.method, this.getNamespace())

        if (rule && rule.isAllowedUnauthorized()) {
            return this.returnOk()
        }

        // If there is no rule for the request - return error
        if (rule === null) {
            return this.returnError(500, `Internal error. Issue with finding the rule for the path ${request.path}`)
        } else {
            // If the user is not authenticated - return error
            if (!request.user.isAuthenticated) {
                return this.returnError(400, "Unauthorized error: Seems like you are not authenticated. Please follow the authentication process using 'LogIn' button")
            }
            // Tries to get customerId from the logTo user structure
            if (request.user && request.user.claims) {
                this.customerId = request.user.claims.sub
            } else {
                return this.returnError(500, "Unauthorized error: Seems like authentication process was corrupted and there are problems with getting customerId")
            }
            // Tries to get scopes for current user and check that required scopes are present
            const _resp = await this.logToHelper.getUserScopes(this.getCustomerId())
            if (_resp.status !== 200) {
                return _resp
            }
            if (_resp.data) {
                this.scopes = _resp.data
            }
            // Checks if the list of scopes from user enough to make an action
            if (!this.areValidScopes(rule, this.getScopes())) {
                this.returnError(400, `Unauthorized error: Current LogTo account does not have the required scopes. You need ${this.getScopeForRoute(request.path, request.method, this.getNamespace())} scope(s).`)
            }
            return this.returnOk()
        }
    }

    private returnOk(): IAuthResponse {
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

    private returnError(status: number, error: string,): IAuthResponse {
        return {
            status: status,
            error: error,
            data: {
                customerId: '',
                scopes: [],
                namespace: this.getNamespace(),
            }
        }
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
        return this.returnOk()
    }

    public skipPath(path: string): boolean {
        for (const ps of AbstractAuthHandler.pathSkip) {
            if (path === "/" || path.startsWith(ps)) {
                return true
            }
        }
        return false
    }

    // common utils
    public setLogToHelper(logToHelper: LogToHelper) {
        this.logToHelper = logToHelper
    }

    private static doesMatchMainnet(matches: string[] | null): boolean {
        if (matches && matches.length > 0) {
            return Namespaces.Mainnet === matches[0]
        }
        return false
    }
    
    public static getNamespaceFromRequest(req: Request): Namespaces {
        if (AbstractAuthHandler.doesMatchMainnet(stringify(req.body).match(cheqdDidRegex))) {
            return Namespaces.Mainnet
        }
        if (AbstractAuthHandler.doesMatchMainnet(req.path.match(cheqdDidRegex))) {
            return Namespaces.Mainnet
        }
        return Namespaces.Testnet
    }

    // Getters
    public getNamespace(): Namespaces {
        return this.namespace
    }

    public getToken(): string {
        return this.token
    }

    public getScopes(): string[] {
        return this.scopes
    }

    public getCustomerId(): string {
        return this.customerId
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
    public registerRoute(route: string, method: string, scope: string, options = {}): void {
        this.routeToScoupe.push(new MethodToScope(route, method, scope, options))
    }

    public findRule(route: string, method: string, namespace=Namespaces.Testnet): MethodToScope | null {
        for (const rule of this.routeToScoupe) {
            if (rule.isRuleMatches(route, method, namespace)) {
                return rule
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

    public isValidScope(rule: MethodToScope, scope: string): boolean {
        return rule.validate(scope)
    }

    public areValidScopes(rule: MethodToScope, scopes: string[]): boolean {
        for (const scope of scopes) {
            if (this.isValidScope(rule, scope)) {
                return true
            }
        }
        return false
    }
}
