import { Request, Response } from "express";
import { AbstractAuthHandler } from "./base_auth.js";
import { IAuthResponse } from "../../types/authentication.js";

export class CredentialStatusAuthHandler extends AbstractAuthHandler {

    constructor () {
        super()
        this.registerRoute('/credential-status/create', 'POST', 'create:credential-status:testnet')
        this.registerRoute('/credential-status/create', 'POST', 'create:credential-status:mainnet')
        this.registerRoute('/credential-status/publish', 'POST', 'publish:credential-status:testnet')
        this.registerRoute('/credential-status/publish', 'POST', 'publish:credential-status:mainnet')
        this.registerRoute('/credential-status/update', 'POST', 'update:credential-status:testnet')
        this.registerRoute('/credential-status/update', 'POST', 'update:credential-status:mainnet')
    }
    public async handle(request: Request, response: Response): Promise<IAuthResponse> {
        if (!request.path.includes('/credential-status')) {
            return super.handle(request, response)
        }
        return this.commonPermissionCheck(request)
    }

}
