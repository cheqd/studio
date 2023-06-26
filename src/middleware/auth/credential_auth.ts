import { Request, Response } from "express";
import { AbstractAuthHandler } from "./base_auth.js";
import { IAuthResponse } from "../../types/authentication.js";

export class CredentialAuthHandler extends AbstractAuthHandler {

    constructor () {
        super()
        this.registerRoute('/credential/issue', 'POST', 'issue:credential:testnet')
        this.registerRoute('/credential/issue', 'POST', 'issue:credential:mainnet')
        this.registerRoute('/credential/verify', 'POST', 'verify:credential:testnet')
        this.registerRoute('/credential/verify', 'POST', 'verify:credential:mainnet')
        this.registerRoute('/credential/revoke', 'POST', 'revoke:credential:testnet')
        this.registerRoute('/credential/revoke', 'POST', 'revoke:credential:mainnet')
        this.registerRoute('/credential/suspend', 'POST', 'suspend:credential:testnet')
        this.registerRoute('/credential/suspend', 'POST', 'suspend:credential:mainnet')
        this.registerRoute('/credential/unsuspend', 'POST', 'unsuspend:credential:testnet')
        this.registerRoute('/credential/unsuspend', 'POST', 'unsuspend:credential:mainnet')
    }

    public async handle(request: Request, response: Response): Promise<IAuthResponse>{
        if (!request.path.includes('/credential')) {
            return super.handle(request, response)
        }
        return this.commonPermissionCheck(request)
    }

}