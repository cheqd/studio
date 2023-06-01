import { ArrayContains, Like, Raw, Repository } from 'typeorm'

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

        if (existingCustomer.kids == null) {
            existingCustomer.kids = kids
        } else {
            existingCustomer.kids = existingCustomer.kids.concat(kids)
        }

        if (existingCustomer.dids == null) {
            existingCustomer.dids = dids
        } else {
            existingCustomer.dids = existingCustomer.dids.concat(dids)
        }

        if (existingCustomer.claimIds == null) {
            existingCustomer.claimIds = claimIds
        } else {
            existingCustomer.claimIds = existingCustomer.claimIds.concat(claimIds)
        }

        if (existingCustomer.presentationIds == null) {
            existingCustomer.presentationIds = presentationIds
        } else {
            existingCustomer.presentationIds = existingCustomer.presentationIds.concat(presentationIds)
        }
        
        return await this.customerRepository.save(existingCustomer)
    }

    public async get(customerId?: string) {
        return customerId ? await this.customerRepository.findOneBy({ customerId }) : await this.customerRepository.find()
    }

    public async find(customerId: string, { kid, did, claimId, presentationId }: {kid?: string, did?: string, claimId?: string, presentationId?: string}) {
        // if (kid) {
        //     where.kids = ArrayContains([kid])
        // }

        // if (did) {
        //     where.dids = ArrayContains([did])
        // }

        // if (claimId) {
        //     where.claimIds = ArrayContains([claimId])
        // }

        // if (presentationId) {
        //     where.presentationIds = ArrayContains([presentationId])
        // }

        try {
            return await this.customerRepository.find({ 
                where : {
                customerId: customerId,
                dids: '["' + did + '"]'
            } }) ? true : false
        } catch {
            return false
        }
    }
}