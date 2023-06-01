import { AfterLoad, BeforeInsert, BeforeUpdate, Column, Entity, PrimaryGeneratedColumn } from 'typeorm'
import { ValueTransformer } from 'typeorm';

import * as dotenv from 'dotenv'
dotenv.config()

const { USE_EXTERNAL_DB } = process.env;

const arrayToJsonTransformer = (shouldTransform: string): ValueTransformer => {
  return {
    to: (array: any[]) => {
      if (shouldTransform == "false") {
        // Convert the array to a JSON string
        return JSON.stringify(array);
      }
      return array;
    },
    from: (jsonString: string) => {
      if (shouldTransform == "false") {
        // Parse the JSON string and return the array
        return JSON.parse(jsonString);
      }
      return jsonString;
    },
  };
};

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

    @Column({
        type: 'text',
        transformer: arrayToJsonTransformer(USE_EXTERNAL_DB),
        nullable: true,
    })
    dids!: string[]

    @Column('text', { array: true, default: [] })
    claimIds!: string[]

    @Column('text', { array: true, default: [] })
    presentationIds!: string[]


    constructor(customerId: string, account: string, address: string) {
        this.customerId = customerId
        this.account = account
        this.address = address
        this.claimIds = []
        this.presentationIds = []
        this.kids = []
    }
}
