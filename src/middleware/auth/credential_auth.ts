import { Request, Response } from "express";
import { AbstractAuthHandler } from "./base_auth.js";
import { IAuthResponse } from "../../types/authentication.js";

export class CredentialAuthHandler extends AbstractAuthHandler {

    constructor () {
        super()
        this.registerRoute('/credential/issue', 'POST', 'credential:issue:testnet')
        this.registerRoute('/credential/issue', 'POST', 'credential:issue:mainnet')
        this.registerRoute('/credential/verify', 'POST', 'credential:verify:testnet')
        this.registerRoute('/credential/verify', 'POST', 'credential:verify:mainnet')
    }

    public async handle(request: Request, response: Response): Promise<IAuthResponse>{
        if (!request.path.includes('/credential')) {
            return super.handle(request, response)
        }
        return this.commonPermissionCheck(request, response)
    }

}