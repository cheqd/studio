/* eslint-disable */
import Long from 'long';
import _m0 from 'protobufjs/minimal';
import { Any } from './any';
import { Coin } from './coin';

export const protobufPackage = 'cosmos.gov.v1beta1';

/**
 * MsgSubmitProposal defines an sdk.Msg type that supports submitting arbitrary
 * proposal Content.
 */
export interface MsgSubmitProposal {
    content?: Any;
    initialDeposit: Coin[];
    proposer: string;
}

/** MsgSubmitProposalResponse defines the Msg/SubmitProposal response type. */
export interface MsgSubmitProposalResponse {
    proposalId: Long;
}

/**
 * MsgVoteWeightedResponse defines the Msg/VoteWeighted response type.
 *
 * Since: cosmos-sdk 0.43
 */
export interface MsgVoteWeightedResponse {}

/** MsgDeposit defines a message to submit a deposit to an existing proposal. */
export interface MsgDeposit {
    proposalId: Long;
    depositor: string;
    amount: Coin[];
}

/** MsgDepositResponse defines the Msg/Deposit response type. */
export interface MsgDepositResponse {}

const baseMsgSubmitProposal: object = { proposer: '' };

export const MsgSubmitProposal = {
    encode(message: MsgSubmitProposal, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
        if (message.content !== undefined) {
            Any.encode(message.content, writer.uint32(10).fork()).ldelim();
        }
        for (const v of message.initialDeposit) {
            Coin.encode(v!, writer.uint32(18).fork()).ldelim();
        }
        if (message.proposer !== '') {
            writer.uint32(26).string(message.proposer);
        }
        return writer;
    },

    decode(input: _m0.Reader | Uint8Array, length?: number): MsgSubmitProposal {
        const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
        let end = length === undefined ? reader.len : reader.pos + length;
        const message = { ...baseMsgSubmitProposal } as MsgSubmitProposal;
        message.initialDeposit = [];
        while (reader.pos < end) {
            const tag = reader.uint32();
            switch (tag >>> 3) {
                case 1:
                    message.content = Any.decode(reader, reader.uint32());
                    break;
                case 2:
                    message.initialDeposit.push(Coin.decode(reader, reader.uint32()));
                    break;
                case 3:
                    message.proposer = reader.string();
                    break;
                default:
                    reader.skipType(tag & 7);
                    break;
            }
        }
        return message;
    },

    fromJSON(object: any): MsgSubmitProposal {
        const message = { ...baseMsgSubmitProposal } as MsgSubmitProposal;
        message.initialDeposit = [];
        if (object.content !== undefined && object.content !== null) {
            message.content = Any.fromJSON(object.content);
        } else {
            message.content = undefined;
        }
        if (object.initialDeposit !== undefined && object.initialDeposit !== null) {
            for (const e of object.initialDeposit) {
                message.initialDeposit.push(Coin.fromJSON(e));
            }
        }
        if (object.proposer !== undefined && object.proposer !== null) {
            message.proposer = String(object.proposer);
        } else {
            message.proposer = '';
        }
        return message;
    },

    toJSON(message: MsgSubmitProposal): unknown {
        const obj: any = {};
        message.content !== undefined && (obj.content = message.content ? Any.toJSON(message.content) : undefined);
        if (message.initialDeposit) {
            obj.initialDeposit = message.initialDeposit.map((e) => (e ? Coin.toJSON(e) : undefined));
        } else {
            obj.initialDeposit = [];
        }
        message.proposer !== undefined && (obj.proposer = message.proposer);
        return obj;
    },

    fromPartial(object: DeepPartial<MsgSubmitProposal>): MsgSubmitProposal {
        const message = { ...baseMsgSubmitProposal } as MsgSubmitProposal;
        if (object.content !== undefined && object.content !== null) {
            message.content = Any.fromPartial(object.content);
        } else {
            message.content = undefined;
        }
        message.initialDeposit = [];
        if (object.initialDeposit !== undefined && object.initialDeposit !== null) {
            for (const e of object.initialDeposit) {
                message.initialDeposit.push(Coin.fromPartial(e));
            }
        }
        message.proposer = object.proposer ?? '';
        return message;
    },
};

const baseMsgSubmitProposalResponse: object = { proposalId: Long.UZERO };

export const MsgSubmitProposalResponse = {
    encode(message: MsgSubmitProposalResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
        if (!message.proposalId.isZero()) {
            writer.uint32(8).uint64(message.proposalId);
        }
        return writer;
    },

    decode(input: _m0.Reader | Uint8Array, length?: number): MsgSubmitProposalResponse {
        const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
        let end = length === undefined ? reader.len : reader.pos + length;
        const message = { ...baseMsgSubmitProposalResponse } as MsgSubmitProposalResponse;
        while (reader.pos < end) {
            const tag = reader.uint32();
            switch (tag >>> 3) {
                case 1:
                    message.proposalId = reader.uint64() as Long;
                    break;
                default:
                    reader.skipType(tag & 7);
                    break;
            }
        }
        return message;
    },

    fromJSON(object: any): MsgSubmitProposalResponse {
        const message = { ...baseMsgSubmitProposalResponse } as MsgSubmitProposalResponse;
        if (object.proposalId !== undefined && object.proposalId !== null) {
            message.proposalId = Long.fromString(object.proposalId);
        } else {
            message.proposalId = Long.UZERO;
        }
        return message;
    },

    toJSON(message: MsgSubmitProposalResponse): unknown {
        const obj: any = {};
        message.proposalId !== undefined && (obj.proposalId = (message.proposalId || Long.UZERO).toString());
        return obj;
    },

    fromPartial(object: DeepPartial<MsgSubmitProposalResponse>): MsgSubmitProposalResponse {
        const message = { ...baseMsgSubmitProposalResponse } as MsgSubmitProposalResponse;
        if (object.proposalId !== undefined && object.proposalId !== null) {
            message.proposalId = object.proposalId as Long;
        } else {
            message.proposalId = Long.UZERO;
        }
        return message;
    },
};

const baseMsgDeposit: object = { proposalId: Long.UZERO, depositor: '' };

export const MsgDeposit = {
    encode(message: MsgDeposit, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
        if (!message.proposalId.isZero()) {
            writer.uint32(8).uint64(message.proposalId);
        }
        if (message.depositor !== '') {
            writer.uint32(18).string(message.depositor);
        }
        for (const v of message.amount) {
            Coin.encode(v!, writer.uint32(26).fork()).ldelim();
        }
        return writer;
    },

    decode(input: _m0.Reader | Uint8Array, length?: number): MsgDeposit {
        const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
        let end = length === undefined ? reader.len : reader.pos + length;
        const message = { ...baseMsgDeposit } as MsgDeposit;
        message.amount = [];
        while (reader.pos < end) {
            const tag = reader.uint32();
            switch (tag >>> 3) {
                case 1:
                    message.proposalId = reader.uint64() as Long;
                    break;
                case 2:
                    message.depositor = reader.string();
                    break;
                case 3:
                    message.amount.push(Coin.decode(reader, reader.uint32()));
                    break;
                default:
                    reader.skipType(tag & 7);
                    break;
            }
        }
        return message;
    },

    fromJSON(object: any): MsgDeposit {
        const message = { ...baseMsgDeposit } as MsgDeposit;
        message.amount = [];
        if (object.proposalId !== undefined && object.proposalId !== null) {
            message.proposalId = Long.fromString(object.proposalId);
        } else {
            message.proposalId = Long.UZERO;
        }
        if (object.depositor !== undefined && object.depositor !== null) {
            message.depositor = String(object.depositor);
        } else {
            message.depositor = '';
        }
        if (object.amount !== undefined && object.amount !== null) {
            for (const e of object.amount) {
                message.amount.push(Coin.fromJSON(e));
            }
        }
        return message;
    },

    toJSON(message: MsgDeposit): unknown {
        const obj: any = {};
        message.proposalId !== undefined && (obj.proposalId = (message.proposalId || Long.UZERO).toString());
        message.depositor !== undefined && (obj.depositor = message.depositor);
        if (message.amount) {
            obj.amount = message.amount.map((e) => (e ? Coin.toJSON(e) : undefined));
        } else {
            obj.amount = [];
        }
        return obj;
    },

    fromPartial(object: DeepPartial<MsgDeposit>): MsgDeposit {
        const message = { ...baseMsgDeposit } as MsgDeposit;
        if (object.proposalId !== undefined && object.proposalId !== null) {
            message.proposalId = object.proposalId as Long;
        } else {
            message.proposalId = Long.UZERO;
        }
        message.depositor = object.depositor ?? '';
        message.amount = [];
        if (object.amount !== undefined && object.amount !== null) {
            for (const e of object.amount) {
                message.amount.push(Coin.fromPartial(e));
            }
        }
        return message;
    },
};

const baseMsgDepositResponse: object = {};

export const MsgDepositResponse = {
    encode(_: MsgDepositResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
        return writer;
    },

    decode(input: _m0.Reader | Uint8Array, length?: number): MsgDepositResponse {
        const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
        let end = length === undefined ? reader.len : reader.pos + length;
        const message = { ...baseMsgDepositResponse } as MsgDepositResponse;
        while (reader.pos < end) {
            const tag = reader.uint32();
            switch (tag >>> 3) {
                default:
                    reader.skipType(tag & 7);
                    break;
            }
        }
        return message;
    },

    fromJSON(_: any): MsgDepositResponse {
        const message = { ...baseMsgDepositResponse } as MsgDepositResponse;
        return message;
    },

    toJSON(_: MsgDepositResponse): unknown {
        const obj: any = {};
        return obj;
    },

    fromPartial(_: DeepPartial<MsgDepositResponse>): MsgDepositResponse {
        const message = { ...baseMsgDepositResponse } as MsgDepositResponse;
        return message;
    },
};

/** Msg defines the bank Msg service. */
export interface Msg {
    /** SubmitProposal defines a method to create new proposal given a content. */
    SubmitProposal(request: MsgSubmitProposal): Promise<MsgSubmitProposalResponse>;
    /** Vote defines a method to add a vote on a specific proposal. */
    Vote(request: any): Promise<any>;
    /**
     * VoteWeighted defines a method to add a weighted vote on a specific proposal.
     *
     * Since: cosmos-sdk 0.43
     */
    VoteWeighted(request: any): Promise<any>;
    /** Deposit defines a method to add deposit on a specific proposal. */
    Deposit(request: MsgDeposit): Promise<MsgDepositResponse>;
}

export class MsgClientImpl implements Msg {
    private readonly rpc: Rpc;
    Vote: any;
    VoteWeighted: any;
    constructor(rpc: Rpc) {
        this.rpc = rpc;
        this.SubmitProposal = this.SubmitProposal.bind(this);
        this.Deposit = this.Deposit.bind(this);
    }
    SubmitProposal(request: MsgSubmitProposal): Promise<MsgSubmitProposalResponse> {
        const data = MsgSubmitProposal.encode(request).finish();
        const promise = this.rpc.request('cosmos.gov.v1beta1.Msg', 'SubmitProposal', data);
        return promise.then((data) => MsgSubmitProposalResponse.decode(new _m0.Reader(data)));
    }

    Deposit(request: MsgDeposit): Promise<MsgDepositResponse> {
        const data = MsgDeposit.encode(request).finish();
        const promise = this.rpc.request('cosmos.gov.v1beta1.Msg', 'Deposit', data);
        return promise.then((data) => MsgDepositResponse.decode(new _m0.Reader(data)));
    }
}

interface Rpc {
    request(service: string, method: string, data: Uint8Array): Promise<Uint8Array>;
}

type Builtin = Date | Function | Uint8Array | string | number | boolean | undefined | Long;
export type DeepPartial<T> = T extends Builtin
    ? T
    : T extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepPartial<U>>
    : T extends {}
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : Partial<T>;

if (_m0.util.Long !== Long) {
    _m0.util.Long = Long as any;
    _m0.configure();
}
