import { ArrayContains, Like, Repository } from 'typeorm'

import { Connection } from '../database/connection/connection.js'
import { CustomerEntity } from '../database/entities/customer.entity.js'
import { getCosmosAccount } from '../helpers/helpers.js'

export class CustomerService {
    public customerRepository : Repository<CustomerEntity>

    public static instance = new CustomerService()

    constructor() {
        this.customerRepository = Connection.instance.dbConnection.getRepository(CustomerEntity)
    }

    public async create(customerId: string, kid: string) {
        const customer = new CustomerEntity(customerId, kid, getCosmosAccount(kid))
        return (await this.customerRepository.insert(customer)).generatedMaps[0]
    }

    public async update(customerId: string, { kids=[], dids=[], claimIds=[], presentationIds=[]} : { kids?: string[], dids?: string[], claimIds?: string[], presentationIds?: string[] }) {
        let existingCustomer = await this.customerRepository.findOneBy({ customerId })
        if (!existingCustomer) {
            throw new Error(`CustomerId not found`)
        }

        existingCustomer.kids= existingCustomer.kids.concat(kids)
        existingCustomer.dids= existingCustomer.dids.concat(dids)
        existingCustomer.claimIds= existingCustomer.claimIds.concat(claimIds)
        existingCustomer.presentationIds= existingCustomer.presentationIds.concat(presentationIds)
        return await this.customerRepository.save(existingCustomer)
    }

    public async get(customerId?: string) {
        return customerId ? await this.customerRepository.findOneBy({ customerId }) : await this.customerRepository.find()
    }

    public async find(customerId: string, { kid, did, claimId, presentationId }: {kid?: string, did?: string, claimId?: string, presentationId?: string}) {
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