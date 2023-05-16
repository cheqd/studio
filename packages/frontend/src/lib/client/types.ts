import { CredentialSchema } from '$shared/schema';
import { z } from 'zod';

export type CheckBoxButtonOption = {
    value: string;
    label: string;
    checked: boolean;
    icon?: string;
};

export const GenericAsyncVoidFuction = z.function().args(z.string()).returns(z.promise(z.void())).optional();
export type GenericAsyncVoidFuctionType = z.infer<typeof GenericAsyncVoidFuction>;

export const GenericAsyncSingleCredentialHandler = z.function().args(CredentialSchema).returns(z.promise(z.void()));
export const BooleanAsyncSingleCredentialHandler = z.function().args(CredentialSchema).returns(z.promise(z.boolean()));
export const TupleAsyncSingleCredentialHandler = z.function().args(CredentialSchema).returns(z.promise(z.tuple([z.boolean(), CredentialSchema])));
export type GenericAsyncSingleCredentialHandlerType = z.infer<typeof GenericAsyncSingleCredentialHandler>;
export type BooleanAsyncSingleCredentialHandlerType = z.infer<typeof BooleanAsyncSingleCredentialHandler>;
export type TupleAsyncSingleCredentialHandlerType = z.infer<typeof TupleAsyncSingleCredentialHandler>;
