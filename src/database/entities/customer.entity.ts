import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('customers')
export class CustomerEntity {
    @Column('string')
    customerId

    @Column('string', {array: true})
    kids

    @Column('string', {array: true})
    dids: string[]

    @Column('string', {array: true})
    claimIds: string[]

    @Column('string', {array: true})
    presentationIds: string[]

    constructor({ customerId, kids=[], dids=[], claimIds=[], presentationIds=[] }: { customerId: string, kids?: string[], dids?: string[], claimIds?: string[], presentationIds?: string[]}) {
        this.customerId = customerId
        this.kids = kids
        this.dids = dids
        this.claimIds = claimIds
        this.presentationIds = presentationIds
    }
}