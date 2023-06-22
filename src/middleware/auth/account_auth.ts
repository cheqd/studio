import { Request, Response } from "express";
import { AbstractAuthHandler } from "./base_auth.js";
import { IAuthResponse } from "../../types/authentication.js";

export class AccountAuthHandler extends AbstractAuthHandler {

    constructor () {
        super()
        this.registerRoute('/account', 'GET', 'account:read:testnet')
        this.registerRoute('/account', 'GET', 'account:read:mainnet')
        this.registerRoute('/account', 'POST', 'account:create:testnet')
        this.registerRoute('/account', 'POST', 'account:create:mainnet')
    }
    public async handle(request: Request, response: Response): Promise<IAuthResponse> {
        if (!request.path.includes('/account')) {
            return super.handle(request, response)
        }
        return this.commonPermissionCheck(request, response)
    }

}