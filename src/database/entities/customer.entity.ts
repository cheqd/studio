import { AfterLoad, BeforeInsert, BeforeUpdate, Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

import * as dotenv from 'dotenv'
dotenv.config()

const { USE_EXTERNAL_DB } = process.env;

@Entity('customers')
export class CustomerEntity {
    @PrimaryGeneratedColumn('uuid')
    customerId!: string

    @Column('text')
    account!: string

    @Column('text')
    address!: string

    @Column('text', { array: true, default: [] })
    kids!: string[]

    @Column('text', { array: true, default: [] })
    dids!: string[]

    @Column('text', { array: true, default: [] })
    claimIds!: string[]

    @Column('text', { array: true, default: [] })
    presentationIds!: string[]


    constructor(customerId: string, account: string, address: string) {
        this.customerId = customerId
        this.account = account
        this.address = address
        this.kids = []
        this.dids = []
        this.claimIds = []
        this.presentationIds = []
    }

    arrayToJSON(array: string[]): any {
        if (array.length > 0) {
            array[0] = JSON.stringify(array)
        }

        return array
    }

    @BeforeInsert()
    beforeInsert(): void {
        if (USE_EXTERNAL_DB == "false") {
            this.dids = this.arrayToJSON(this.dids)
            this.kids = this.arrayToJSON(this.kids)
            this.claimIds = this.arrayToJSON(this.claimIds)
            this.presentationIds = this.arrayToJSON(this.presentationIds)
        }
    }

    @BeforeUpdate()
    beforeUpdate(): void {
        this.beforeInsert()
    }

    jsonToArray(array: string[]): any {
        let str = JSON.stringify(array)
        str = str.replace("\"[object Object]\"", "")
        if (str.length > 0) {
            array = JSON.parse(str)
        } else {
            array = []
        }

        return array
    }

    @AfterLoad()
    afterLoad(): void {
        if (USE_EXTERNAL_DB == "false") {
            this.dids = this.jsonToArray(this.dids)
            this.kids = this.jsonToArray(this.kids)
            this.claimIds = this.jsonToArray(this.claimIds)
            this.presentationIds = this.jsonToArray(this.presentationIds)
        }
    }
}