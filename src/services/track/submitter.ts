// Type: Interface
export type ISubmitData = ISubmitStripeCustomerCreateData
    | ISubmitSubscriptionData;

export interface ISubmitStripeCustomerCreateData {
    customerId: string;
    name: string;
    email?: string;
}

export interface ISubmitSubscriptionData {
    stripeCustomerId: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    trialStart?: Date;
    trialEnd?: Date;
    subscriptionId: string;
}

export interface ISubmitOperation {
    operation: string;
    data: ISubmitData;
}
