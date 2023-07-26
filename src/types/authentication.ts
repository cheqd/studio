import {Request, Response } from 'express'

export enum Namespaces{
    Testnet = 'testnet',
    Mainnet = 'mainnet',
}

export class MethodToScope {
    private route: string
    private method: string
    private scope: string
    constructor(route: string, method: string, scope: string) {
      this.route = route
      this.method = method
      this.scope = scope
    }
    
    public validate(route: string, method: string, scope: string, namespace=Namespaces.Testnet): boolean {
      return this.route === route && this.method === method && this.scope === scope && this.scope.includes(namespace)
    }
  
    public isRule(route: string, method: string, namespace=Namespaces.Testnet): boolean {
      return this.route === route && this.method === method && this.scope.includes(namespace)
    }
  
    public getScope(): string {
      return this.scope
    }
  }

export interface IAuthResponse{
    status: number,
    data: {
        customerId: string,
        scopes: string[],
        namespace: Namespaces,
    }
    error: string
}

export interface ICommonErrorResponse {
    status: number,
    error: string,
    data: any
}

export interface IAuthResourceHandler {
    setNext(handler: IAuthResourceHandler): IAuthResourceHandler
    handle(request: Request, response: Response): Promise<IAuthResponse>
    skipPath(path: string): boolean

    // Getters
    getNamespace(): string
    getScopes(): string[] | unknown
    getCustomerId(): string
    getToken(): string
}