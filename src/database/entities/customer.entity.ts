import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('customers')
export class CustomerEntity {
    @PrimaryGeneratedColumn('uuid')
    customerId!: string

    @Column('text')
    account!: string

    @Column('text')
    address!: string
    
    @Column('text', {array: true, default: []})
    kids!: string[]

    @Column('text', {array: true, default: []})
    dids!: string[]

    @Column('text', {array: true, default: []})
    claimIds!: string[]

    @Column('text', {array: true, default: []})
    presentationIds!: string[]


    constructor(customerId: string, account: string, address: string) {
        this.customerId= customerId
        this.account = account
        this.address = address
        this.kids= []
        this.dids= []
        this.claimIds= []
        this.presentationIds= []
    }
}