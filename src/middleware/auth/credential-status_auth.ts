import { Request, Response } from "express";
import { AbstractAuthHandler } from "./base_auth.js";
import { IAuthResponse } from "../../types/authentication.js";

export class CredentialStatusAuthHandler extends AbstractAuthHandler {

    constructor () {
        super()
        this.registerRoute('/credential-status', 'POST', 'create:credential-status:statuslist2021:testnet')
        this.registerRoute('/credential-status', 'POST', 'create:credential-status:statuslist2021:mainnet')
        this.registerRoute('/credential-status/list', 'GET', 'list:credential-status:statuslist2021:testnet')
        this.registerRoute('/credential-status/list', 'GET', 'list:credential-status:statuslist2021:mainnet')
    }
    public async handle(request: Request, response: Response): Promise<IAuthResponse> {
        if (!request.path.includes('/list')) {
            return super.handle(request, response)
        }
        return this.commonPermissionCheck(request)
    }

}