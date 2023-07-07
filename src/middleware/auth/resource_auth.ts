import { Request, Response } from "express";
import { AbstractAuthHandler } from "./base_auth.js";
import { IAuthResponse } from "../../types/authentication.js";

export class PresentationAuthHandler extends AbstractAuthHandler {

    constructor () {
        super()
        this.registerRoute('/presentation/verify', 'POST', 'verify:presentation:testnet')
        this.registerRoute('/presentation/verify', 'POST', 'verify:presentation:mainnet')
    }
    public async handle(request: Request, response: Response): Promise<IAuthResponse> {
        if (!request.path.includes('/presentation')) {
            return super.handle(request, response)
        }
        return this.commonPermissionCheck(request)
    }

}