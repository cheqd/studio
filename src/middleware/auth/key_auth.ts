import { Request, Response } from "express";
import { AbstractAuthHandler } from "./base_auth.js";
import { IAuthResponse } from "../../types/authentication.js";

export class KeyAuthHandler extends AbstractAuthHandler {

    constructor () {
        super()
        this.registerRoute('/key', 'POST', 'key:create:testnet')
        this.registerRoute('/key', 'POST', 'key:create:mainnet')
        this.registerRoute('/key', 'GET', 'key:read:testnet')
        this.registerRoute('/key', 'GET', 'key:read:mainnet')
    }

    public async handle(request: Request, response: Response): Promise<IAuthResponse> {
        if (!request.path.includes('/key')) {
            return super.handle(request, response)
        }
        return this.commonPermissionCheck(request, response)

    }

}