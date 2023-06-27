import * as dotenv from 'dotenv'
import { ILogToErrorResponse } from '../../types/authentication'
dotenv.config()


export class LogToHelper {

  private m2mToken: string
  private allScopes: string[]
  private allResourceWithNames: string[]
  public defaultScopes: string[]

  constructor () {
    this.m2mToken = ""
    this.allScopes = []
    this.defaultScopes = []
    this.allResourceWithNames = []
    this.setup()
  }

  public async setup(): Promise<ILogToErrorResponse | void>{
    let _r = {} as ILogToErrorResponse | void
    _r = await this.setM2MToken()
    if (_r && _r.status !== 200) {
        return _r
    }
    _r = await this.setDefaultScopes()
    if (_r && _r.status !== 200) {
        return _r
    }
    _r = await this.setAllScopes()
    if (_r && _r.status !== 200) {
        return _r
    }
    _r = await this.setAllResourcesWithNames()
    if (_r && _r.status !== 200) {
        return _r
    }
  }

  public getAllScopes(): string[] {
    return this.allScopes
  }

  public getDefaultScopes(): string[] {
    return this.defaultScopes
  }

  public getAllResourcesWithNames(): string[] {
    return this.allResourceWithNames
  }

  private async setDefaultScopes(): Promise<ILogToErrorResponse | void>{
    const _r = await this.getAllResources()
    if (_r.status === 200) {
        for (const r of _r.data) {
            if (r.indicator === process.env.LOGTO_DEFAULT_RESOURCE_URL) {
                const _rr = await this.askForScopes(r.id)
                if (_rr.status === 200) {
                    this.defaultScopes = _rr.data
                }
                else {
                    return _rr
                }
            }
        }
    } else {
        return _r
    }
  }

  private async setM2MToken() : Promise<ILogToErrorResponse | void> {
    const searchParams = new URLSearchParams({
        grant_type: 'client_credentials',
        resource: process.env.LOGTO_MANAGEMENT_API as string,
        scope: 'all',
    });

    const uri = new URL('/oidc/token', process.env.LOGTO_ENDPOINT);
    const token = `Basic ${btoa(process.env.LOGTO_M2M_APP_ID + ':' + process.env.LOGTO_M2M_APP_SECRET)}`;

    try {
        const response = await fetch(uri, {
            method: 'POST',
            body: searchParams,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: token,
            },
        });
        const data = await response.json();
        if (response.status === 200) {
            this.m2mToken = data.access_token
        }
    } catch (err) {
        return {
            status: 500,
            error: `setM2MToken: ${err}`,
            data: {}
        }
    }
  }

  private async setAllScopes(): Promise<ILogToErrorResponse | void> {

    const allResources = await this.getAllResources()
    if (allResources.status === 200) {
        for (const resource of allResources.data) {
            if (resource.id !== "management-api") {
                const scopes = await this.askForScopes(resource.id)
                if (scopes.status == 200) {
                    this.allScopes = this.allScopes.concat(scopes.data)    
                }
            }
        }
        
    } else {
        return allResources
    }
  }

  private async setAllResourcesWithNames(): Promise<ILogToErrorResponse | void> {
    const allResources = await this.getAllResources()
    if (allResources.status === 200) {
        for (const resource of allResources.data) {
            this.allResourceWithNames.push(resource.indicator)
        }
    } else {
        return allResources
    }
  }

  private async askForScopes(resourceId: string): Promise<ILogToErrorResponse> {
    const uri = new URL(`/api/resources/${resourceId}/scopes`, process.env.LOGTO_ENDPOINT);
    const scopes = []

    try {
        const response = await fetch(uri, {
            headers: {
                Authorization: 'Bearer ' + this.m2mToken,
            },
        });

        if (response.status === 200) {

            const metadata = await response.json()
            for (const sc of metadata) {
                scopes.push(sc.name)
            }
            return {
                status: 200,
                error: "",
                data: scopes
            }
        }
        return {
            error: await response.text(),
            status: response.status,
            data: {}
        }

        
    } catch (err) {
        return {
            error: `askForScopes ${err}`,
            status: 500,
            data: {}
        }
    }
  }

  private async getAllResources(): Promise<ILogToErrorResponse> {
    const uri = new URL(`/api/resources`, process.env.LOGTO_ENDPOINT);

    try {
        const response = await fetch(uri, {
            headers: {
                Authorization: 'Bearer ' + this.m2mToken,
            },
        });
        
        if (response.status === 200) {
            const metadata = (await response.json())
            return {
                error: "",
                status: 200,
                data: metadata,
            }
        }
        return {
            error: await response.text(),
            status: response.status,
            data: {}
        }
        
    } catch (err) {
        return {
            error: `getAllResources ${err}`,
            status: 500,
            data: {},
        }
    }
  }
}