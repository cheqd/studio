import { Request, Response } from 'express';
import { LocalStore } from '../services/store';

export class StoreController {
    
    public set(request: Request, response: Response) {
        const body = request.body
        const key = LocalStore.instance.setItem(body.data)
        return response.status(200).json({
           path: key 
        })
    }

    public get(request: Request, response: Response) {
        const data = LocalStore.instance.getItem(request.params.id)
        if(data) {
            return response.status(200).json({
                data
            })
        } else {
            return response.status(400).json({
                error: 'Not Found'
            })
        }
    }
}