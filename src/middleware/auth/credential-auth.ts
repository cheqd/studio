import { Request, Response } from "express";
import { AbstractAuthHandler } from "./base-auth.js";
import { IAuthResponse } from "../../types/authentication.js";

export class CredentialAuthHandler extends AbstractAuthHandler {

    constructor () {
        super()
        this.registerRoute('/credential/issue', 'POST', 'issue:credential:testnet')
        this.registerRoute('/credential/issue', 'POST', 'issue:credential:mainnet')
        this.registerRoute('/credential/revoke', 'POST', 'revoke:credential:testnet')
        this.registerRoute('/credential/revoke', 'POST', 'revoke:credential:mainnet')
        this.registerRoute('/credential/suspend', 'POST', 'suspend:credential:testnet')
        this.registerRoute('/credential/suspend', 'POST', 'suspend:credential:mainnet')
        this.registerRoute('/credential/reinstate', 'POST', 'reinstate:credential:testnet')
        this.registerRoute('/credential/reinstate', 'POST', 'reinstate:credential:mainnet')
    }

    public async handle(request: Request, response: Response): Promise<IAuthResponse>{
        if (!request.path.includes('/credential')) {
            return super.handle(request, response)
        }
        return this.commonPermissionCheck(request)
    }

}
