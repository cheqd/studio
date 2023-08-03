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
    if (_r.status !== 200) {
        return _r
    }
    _r = await this.setDefaultScopes()
    if (_r.status !== 200) {
        return _r
    }
    _r = await this.setAllScopes()
    if (_r.status !== 200) {
        return _r
    }
    _r = await this.setAllResourcesWithNames()
    if (_r.status !== 200) {
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

  public async setDefaultRoleForUser(userId: string): Promise<ILogToErrorResponse> {
    const roles = await this.getRolesForUser(userId)
    if (roles.status === 200) {
        // Check that default role is set
        for (const role of roles.data) {
            if (role.id === process.env.LOGTO_DEFAULT_ROLE_ID) {
                return this.returnOk(roles.data)
            }
        }
        
        // Assign a default role to a user
        return await this.assignDefaultRoleForUser(userId, process.env.LOGTO_DEFAULT_ROLE_ID)
    }
    return roles
  }

  private returnOk(data: any): ILogToErrorResponse {
    return {
        status: 200,
        error: '',
        data: data
    }
  }

  private returnError(status: number, error: string, data: any = {}): ILogToErrorResponse {
        return {
            status: status,
            error: error,
            data: data
        }
  }

  public async getUserScopes(userId: string): Promise<ILogToErrorResponse> {
    const scopes = [] as string[]
    const roles = await this.getRolesForUser(userId)
    if (roles.status === 200) {
        // Check that default role is set
        for (const role of roles.data) {
            const _s = await this.askRoleForScopes(role.id)
            if (_s.status === 200) {
                scopes.push(..._s.data)
            }
        }
        return this.returnOk(scopes)
    }
    return roles
}

  private async assignDefaultRoleForUser(userId: string, roleId: string): Promise<ILogToErrorResponse> {
    const userInfo = await this.getUserInfo(userId)
    const uri = new URL(`/api/users/${userId}/roles`, process.env.LOGTO_ENDPOINT);

    if (userInfo.status === 200) {
        // Means that user exists
        if (userInfo.data.isSuspended === 'true') {
            return this.returnError(401, 'User is suspended')
        }
        // Means it's not suspended
        const role = await this.getRoleInfo(roleId)
        if (role.status === 200) {
            // Such role exists
            try {
                const body = {
                    roleIds: [roleId],
                };
                return await this.postToLogto(uri, body, {'Content-Type': 'application/json'})
            } catch (err) {
                return this.returnError(500, `getRolesForUser ${err}`)
            }
        } else {
            return this.returnError(500, `Could not fetch the info about role with roleId ${roleId}`)
        }
        
    } else {
        return this.returnError(500, `Could not fetch the info about user with userId ${userId}`)
    }
  }

  private async getRolesForUser(userId: string): Promise<ILogToErrorResponse> {
    const uri = new URL(`/api/users/${userId}/roles`, process.env.LOGTO_ENDPOINT);
    try {
        // Note: By default, the API returns first 20 roles.
        // If our roles per user grows to more than 20, we need to implement pagination
        return await this.getToLogto(uri, 'GET')
    } catch (err) {
        return this.returnError(500, `getRolesForUser ${err}`)
    }
  }

  private async postToLogto(uri: URL, body: any, headers: any = {}): Promise<ILogToErrorResponse> {
    const response = await fetch(uri, {
        headers: {
            ...headers,
            Authorization: 'Bearer ' + this.m2mToken,
        },
        body: JSON.stringify(body),
        method: "POST"
    });

    if (!response.ok) {
        return this.returnError(response.status, await response.json())
    }
    return this.returnOk({})
  }

  private async getToLogto(uri: URL, headers: any = {}): Promise<ILogToErrorResponse> {
    const response = await fetch(uri, {
        headers: {
            ...headers,
            Authorization: 'Bearer ' + this.m2mToken,
        },
        method: "GET"
    });

    if (!response.ok) {
        return this.returnError(response.status, await response.json())
    }
    const metadata = await response.json()
    return this.returnOk(metadata)
  }

  private async getUserInfo(userId: string): Promise<ILogToErrorResponse> {
    const uri = new URL(`/api/users/${userId}`, process.env.LOGTO_ENDPOINT);
    try {
        return await this.getToLogto(uri, 'GET')
    } catch (err) {
        return this.returnError(500, `getUserInfo ${err}`)
    }
  }

  private async getRoleInfo(roleId: string): Promise<ILogToErrorResponse> {
    const uri = new URL(`/api/roles/${roleId}`, process.env.LOGTO_ENDPOINT);
    try {
        return await this.getToLogto(uri, 'GET')
    } catch (err) {
        return this.returnError(500, `getRoleInfo ${err}`)
    }
  }

  private async setDefaultScopes(): Promise<ILogToErrorResponse>{
    const _r = await this.getAllResources()
    if ( _r.status === 200) {
        for (const r of _r.data) {
            if (r.indicator === process.env.LOGTO_DEFAULT_RESOURCE_URL) {
                const _rr = await this.askResourceForScopes(r.id)
                if (_rr.status === 200) {
                    this.defaultScopes = _rr.data
                    return this.returnOk({})
                }
                else {
                    return _rr
                }
            }
        }
        return this.returnError(500, `Looks like ${process.env.LOGTO_DEFAULT_RESOURCE_URL} is not setup on LogTo side`)
    } else {
        return _r
    }
  }

  private async setM2MToken() : Promise<ILogToErrorResponse> {
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
        if (!response.ok) {
            return this.returnError(response.status, await response.text())
            
        }
        const data = await response.json();
        this.m2mToken = data.access_token
        return this.returnOk({})
    } catch (err) {
        return this.returnError(500, `setM2MToken: ${err}`)
    }
  }

  private async setAllScopes(): Promise<ILogToErrorResponse> {

    const allResources = await this.getAllResources()
    if (allResources.status === 200) {
        for (const resource of allResources.data) {
            if (resource.id !== "management-api") {
                const scopes = await this.askResourceForScopes(resource.id)
                if (scopes.status == 200) {
                    this.allScopes = this.allScopes.concat(scopes.data)    
                } else {
                    return this.returnError(500, `setAllScopes: Error while getting the scopes for ${resource.id}`)
                }
            }
        }
        return this.returnOk({})
    } else {
        return this.returnError(500, `setAllScopes: Error while getting all resources`)
    }
  }

  private async setAllResourcesWithNames(): Promise<ILogToErrorResponse> {
    const allResources = await this.getAllResources()
    if (allResources.status === 200) {
        for (const resource of allResources.data) {
            this.allResourceWithNames.push(resource.indicator)
        }
        return this.returnOk({})
    } else {
        return allResources
    }
  }

  private async askRoleForScopes(roleId: string): Promise<ILogToErrorResponse> {
    const uri = new URL(`/api/roles/${roleId}/scopes`, process.env.LOGTO_ENDPOINT);
    const scopes = []

    try {
        const metadata = await this.getToLogto(uri, 'GET')
        if (metadata && metadata.status === 200) {
            for (const sc of metadata.data) {
                scopes.push(sc.name)
            }
            return this.returnOk(scopes)
        } else {
            return this.returnError(500, `askRoleForScopes: Error while getting the all scopes for the role ${roleId}`)
        }
    } catch (err) {
        return this.returnError(500, `askRoleForScopes ${err}`)
    }
  }

  private async askResourceForScopes(resourceId: string): Promise<ILogToErrorResponse> {
    const uri = new URL(`/api/resources/${resourceId}/scopes`, process.env.LOGTO_ENDPOINT);
    const scopes = []

    try {
        const metadata = await this.getToLogto(uri, 'GET')
        if (metadata && metadata.status === 200) {
            for (const sc of metadata.data) {
                scopes.push(sc.name)
            }
            return this.returnOk(scopes)
        } else {
            return this.returnError(500, `askResourceForScopes: Error while getting the all scopes for the resource ${resourceId}`)
        }
    } catch (err) {
        return this.returnError(500, `askResourceForScopes ${err}`)
    }
  }

  private async getAllResources(): Promise<ILogToErrorResponse> {
    const uri = new URL(`/api/resources`, process.env.LOGTO_ENDPOINT);

    try {
        return await this.getToLogto(uri, 'GET')  
    } catch (err) {
        return this.returnError(500, `getAllResources ${err}`)
    }
  }
}
