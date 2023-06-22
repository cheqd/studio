import { Request, Response } from "express";
import { AbstractAuthHandler } from "./base_auth.js";
import { IAuthResponse } from "../../types/authentication.js";

export class DidAuthHandler extends AbstractAuthHandler {

    constructor () {
        super()
        this.registerRoute('/did/create', 'POST', 'did:create:testnet')
        this.registerRoute('/did/create', 'POST', 'did:create:mainnet')
    }

    public async handle(request: Request, response: Response): Promise<IAuthResponse> {
        if (!request.path.includes('/did')) {
            return super.handle(request, response)
        }
        return this.commonPermissionCheck(request, response)
    }

}