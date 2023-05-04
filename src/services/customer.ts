import { Connection } from '../database/connection/connection'
import { CustomerEntity } from '../database/entities/customer.entity'


export class CustomerService {
    public async create(customer: CustomerEntity) {
        return await Connection.instance.dbConnection.manager.save(customer)
    }

    public async update(customer: CustomerEntity, customerId: string) {
        return await Connection.instance.dbConnection.manager.save({ customerId, customer })
    }

    public async get() {
        return await Connection.instance.dbConnection.manager.find(CustomerEntity)
    }
}