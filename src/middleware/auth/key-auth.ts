import { Request, Response } from "express";
import { AbstractAuthHandler } from "./base-auth.js";
import { IAuthResponse } from "../../types/authentication.js";

export class KeyAuthHandler extends AbstractAuthHandler {

    constructor () {
        super()
        this.registerRoute('/key', 'POST', 'create:key')
        this.registerRoute('/key', 'GET', 'read:key')
        this.registerRoute('/key/list', 'GET', 'list:key')
    }

    public async handle(request: Request, response: Response): Promise<IAuthResponse> {
        if (!request.path.includes('/key')) {
            return super.handle(request, response)
        }
        return this.commonPermissionCheck(request)

    }

}
