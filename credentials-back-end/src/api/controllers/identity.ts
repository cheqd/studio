import {
    IIdentifier,
    TAgent,
} from '@veramo/core'

export class Identity {

    agent: TAgent<any> | null | undefined

    constructor(agent?: TAgent<any>, mode?: string) {
        this.agent = agent
        if( mode === 'demo' ) return
    }

    async create_demo_id(request: Request, agent: TAgent<any>): Promise<IIdentifier> {
        if( !this.agent && !agent ) throw new Error('No initialised agent found.')

        if( agent ) this.agent = agent

        const identity = await agent.execute(
            'didManagerCreate',
            {}
        )

        return identity
    }
}