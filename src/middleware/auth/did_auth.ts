import { Request, Response } from "express";
import { AbstractAuthHandler } from "./base_auth.js";
import { IAuthResponse } from "../../types/authentication.js";

export class DidAuthHandler extends AbstractAuthHandler {

    constructor () {
        super()
        this.registerRoute('/did/create', 'POST', 'create:did:testnet')
        this.registerRoute('/did/create', 'POST', 'create:did:mainnet')
        this.registerRoute('/did/list', 'GET', 'list:did:testnet')
        this.registerRoute('/did/list', 'GET', 'list:did:mainnet')
        this.registerRoute('/did', 'GET', 'read:did:testnet')
        this.registerRoute('/did', 'GET', 'read:did:mainnet')
        this.registerRoute('/did/update', 'POST', 'update:did:testnet')
        this.registerRoute('/did/update', 'POST', 'update:did:mainnet')
        this.registerRoute('/did/deactivate', 'POST', 'update:did:testnet')
        this.registerRoute('/did/deactivate', 'POST', 'update:did:mainnet')
    }

    public async handle(request: Request, response: Response): Promise<IAuthResponse> {
        if (!request.path.includes('/did')) {
            return super.handle(request, response)
        }
        return this.commonPermissionCheck(request)
    }

}