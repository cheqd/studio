import { ArrayContains, Repository } from 'typeorm'

import { Connection } from '../database/connection/connection.js'
import { CustomerEntity } from '../database/entities/customer.entity.js'
import { getCosmosAccount } from '../helpers/helpers.js'
import { Identity } from './identity/index.js'

import * as dotenv from 'dotenv'
dotenv.config()

const { ENABLE_EXTERNAL_DB } = process.env;

export class CustomerService {
    public customerRepository: Repository<CustomerEntity>

    public static instance = new CustomerService()

    constructor() {
        this.customerRepository = Connection.instance.dbConnection.getRepository(CustomerEntity)
    }

    public async create(customerId: string) {
        const kid = (await Identity.createKey('Secp256k1', customerId)).kid
        const customer = new CustomerEntity(customerId, kid, getCosmosAccount(kid))
        return (await this.customerRepository.insert(customer)).identifiers[0]
    }

    public async update(customerId: string, { kids=[], dids=[], claimIds=[], presentationIds=[]} : { kids?: string[], dids?: string[], claimIds?: string[], presentationIds?: string[] }) {
        const existingCustomer = await this.customerRepository.findOneBy({ customerId })
        if (!existingCustomer) {
            throw new Error(`CustomerId not found`)
        }

        existingCustomer.kids = this.concatenate(existingCustomer.kids, kids)
        existingCustomer.dids = this.concatenate(existingCustomer.dids, dids)
        existingCustomer.claimIds = this.concatenate(existingCustomer.claimIds, claimIds)
        existingCustomer.presentationIds = this.concatenate(existingCustomer.presentationIds, presentationIds)

        return await this.customerRepository.save(existingCustomer)
    }

    public async get(customerId?: string) {
        return customerId ? await this.customerRepository.findOneBy({ customerId }) : await this.customerRepository.find()
    }

    public async find(customerId: string, { kid, did, claimId, presentationId }: { kid?: string, did?: string, claimId?: string, presentationId?: string }) {
        if (ENABLE_EXTERNAL_DB == "true") {
            return this.findFromExternalDB(customerId, { kid: kid, did: did, claimId: claimId, presentationId: presentationId })
        } else {
            return this.findFromMemoryDB(customerId, { kid: kid, did: did, claimId: claimId, presentationId: presentationId })
        }
    }

    private concatenate(array: any[], items: any[]): any {
        return array ? array.concat(items) : items
    }

    private has(array: any[], item: any): any {
        for (let i = 0; i < array.length; i++) {
            if (array[i] == item) {
                return true
            }
        }

        return false
    }

    private async findFromMemoryDB(customerId: string, { kid, did, claimId, presentationId }: { kid?: string, did?: string, claimId?: string, presentationId?: string }) {
        const result = (await this.customerRepository.findOneBy({ customerId }))
        if (!result) {
            return false
        }

        if (kid) {
            if (!this.has(result.kids, kid)) {
                return false
            }
        }

        if (did) {
            if (!this.has(result.dids, did)) {
                return false
            }
        }

        if (claimId) {
            if (!this.has(result.claimIds, claimId)) {
                return false
            }
        }

        if (presentationId) {
            if (!this.has(result.presentationIds, presentationId)) {
                return false
            }
        }

        return true
    }

    private async findFromExternalDB(customerId: string, { kid, did, claimId, presentationId }: { kid?: string, did?: string, claimId?: string, presentationId?: string }) {
        const where: any = {
            customerId
        }

        if (kid) {
            where.kids = ArrayContains([kid])
        }

        if (did) {
            where.dids = ArrayContains([did])
        }

        if (claimId) {
            where.claimIds = ArrayContains([claimId])
        }

        if (presentationId) {
            where.presentationIds = ArrayContains([presentationId])
        }

        try {
            return await this.customerRepository.findOne({ where }) ? true : false
        } catch {
            return false
        }
    }
}