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

  public async setDefaultRoleForUser(userId: string): Promise<ILogToErrorResponse | void> {
    const roles = await this.getRolesForUser(userId)
    let isDefaultRoleSet = false
    if (roles && roles.status === 200 && roles.data.length === 0) {
        // Check that default roles is not set yet
        for (const role of roles.data) {
            if (role.id === process.env.LOGTO_DEFAULT_ROLE_ID) {
                isDefaultRoleSet = true
            }
        }
        if (!isDefaultRoleSet) {
            return await this.assignDefaultRoleForUser(userId, process.env.LOGTO_DEFAULT_ROLE_ID)
        }
    }
  }

  private async assignDefaultRoleForUser(userId: string, roleId: string): Promise<ILogToErrorResponse | void> {
    const userInfo = await this.getUserInfo(userId)
    const uri = new URL(`/api/users/${userId}/roles`, process.env.LOGTO_ENDPOINT);

    if (userInfo && userInfo.status === 200) {
        // Means that user exists
        if (userInfo.data.isSuspended === 'true') {
            return {
                error: 'User is suspended',
                status: 401,
                data: {}
            }
        }
        // Means it's not suspended
        const role = await this.getRoleInfo(roleId)
        if (role && role.status === 200) {
            // Such role exists
            try {
                const body = {
                    roleIds: [roleId],
                };
                return await this.postToLogto(uri, body, {'Content-Type': 'application/json'})
            } catch (err) {
                return {
                    error: `getRolesForUser ${err}`,
                    status: 500,
                    data: {}
                }
            }
        } else {
            return {
                error: 'Looks like default role does not exist',
                status: 500,
                data: {}
            }
        }
        
    } else {
        return {
            error: 'Looks like user does not exist',
            status: 500,
            data: {}
        }
    }
  }

  private async getRolesForUser(userId: string): Promise<ILogToErrorResponse | void> {
    const uri = new URL(`/api/users/${userId}/roles`, process.env.LOGTO_ENDPOINT);
    try {
        return await this.getToLogto(uri, 'GET')
    } catch (err) {
        return {
            error: `getRolesForUser ${err}`,
            status: 500,
            data: {}
        }
    }
  }

  private async postToLogto(uri: URL, body: any, headers: any = {}): Promise<ILogToErrorResponse | void> {
    const response = await fetch(uri, {
        headers: {
            ...headers,
            Authorization: 'Bearer ' + this.m2mToken,
        },
        body: JSON.stringify(body),
        method: "POST"
    });

    if (!response.ok) {
        return {
            status: response.status,
            error: await response.json(),
            data: {}
        }
    }
    return {
        error: await response.text(),
        status: response.status,
        data: {}
    }
  }

  private async getToLogto(uri: URL, headers: any = {}): Promise<ILogToErrorResponse | void> {
    const response = await fetch(uri, {
        headers: {
            ...headers,
            Authorization: 'Bearer ' + this.m2mToken,
        },
        method: "GET"
    });

    if (response.ok) {

        const metadata = await response.json()
        
        return {
            status: 200,
            error: "",
            data: metadata
        }
    }
    return {
        error: await response.text(),
        status: response.status,
        data: {}
    }
  }

  private async getUserInfo(userId: string): Promise<ILogToErrorResponse | void> {
    const uri = new URL(`/api/users/${userId}`, process.env.LOGTO_ENDPOINT);
    try {
        return await this.getToLogto(uri, 'GET')
    } catch (err) {
        return {
            error: `getUserInfo ${err}`,
            status: 500,
            data: {}
        }
    }
  }

  private async getRoleInfo(roleId: string): Promise<ILogToErrorResponse | void> {
    const uri = new URL(`/api/roles/${roleId}`, process.env.LOGTO_ENDPOINT);
    try {
        return await this.getToLogto(uri, 'GET')
    } catch (err) {
        return {
            error: `getUserInfo ${err}`,
            status: 500,
            data: {}
        }
    }
  }

  private async setDefaultScopes(): Promise<ILogToErrorResponse | void>{
    const _r = await this.getAllResources()
    if (_r && _r.status === 200) {
        for (const r of _r.data) {
            if (r.indicator === process.env.LOGTO_DEFAULT_RESOURCE_URL) {
                const _rr = await this.askForScopes(r.id)
                if (_rr && _rr.status === 200) {
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
        if (response.ok) {
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
    if (allResources && allResources.status === 200) {
        for (const resource of allResources.data) {
            if (resource.id !== "management-api") {
                const scopes = await this.askForScopes(resource.id)
                if (scopes && scopes.status == 200) {
                    this.allScopes = this.allScopes.concat(scopes.data)    
                } else {
                    return {
                        status: 500,
                        error: `setAllScopes: Error while getting the scopes for ${resource.id}`,
                        data: {}
                    }
                }
            }
        }
        
    } else {
        return {
            status: 500,
            error: `setAllScopes: Error while getting all resources`,
            data: {}
        }
    }
  }

  private async setAllResourcesWithNames(): Promise<ILogToErrorResponse | void> {
    const allResources = await this.getAllResources()
    if (allResources && allResources.status === 200) {
        for (const resource of allResources.data) {
            this.allResourceWithNames.push(resource.indicator)
        }
    } else {
        return allResources
    }
  }

  private async askForScopes(resourceId: string): Promise<ILogToErrorResponse | void> {
    const uri = new URL(`/api/resources/${resourceId}/scopes`, process.env.LOGTO_ENDPOINT);
    const scopes = []

    try {
        const metadata = await this.getToLogto(uri, 'GET')
        if (metadata && metadata.status === 200) {
            for (const sc of metadata.data) {
                scopes.push(sc.name)
            }
            return {
                status: 200,
                error: "",
                data: scopes
            }
        } else {
            return {
                status: 500,
                error: `askForScopes: Error while getting the all scopes for the resource ${resourceId}`,
                data: {}
            }
        }
    } catch (err) {
        return {
            error: `askForScopes ${err}`,
            status: 500,
            data: {}
        }
    }
  }

  private async getAllResources(): Promise<ILogToErrorResponse | void> {
    const uri = new URL(`/api/resources`, process.env.LOGTO_ENDPOINT);

    try {
        return await this.getToLogto(uri, 'GET')  
    } catch (err) {
        return {
            error: `getAllResources ${err}`,
            status: 500,
            data: {},
        }
    }
  }
}