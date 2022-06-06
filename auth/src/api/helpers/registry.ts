import { Registry, GeneratedType } from '@cosmjs/proto-signing';
import { AminoTypes, AminoConverters, AminoConverter } from '@cosmjs/stargate';

import { Tx } from './tx';
import { MsgSubmitProposal } from './codecs/gov';

const registryTypes: Iterable<[string, GeneratedType]> = [
    /* ['/cosmos.auth.v1beta1.BaseAccount', BaseAccount],
    ['/cosmos.auth.v1beta1.ModuleAccount', ModuleAccount],
    ['/cosmos.auth.v1beta1.Params', AuthParams],
    ['/cosmos.authz.v1beta1.MsgGrant', MsgGrant],
    ['/cosmos.authz.v1beta1.MsgExec', MsgExec],
    ['/cosmos.authz.v1beta1.MsgRevoke', MsgRevoke],
    ['/cosmos.bank.v1beta1.MsgSend', MsgSend],
    ['/cosmos.bank.v1beta1.MsgMultiSend', MsgMultiSend],
    ['/cosmos.base.v1beta1.Coin', Coin],
    ['/cosmos.base.v1beta1.DecCoin', DecCoin],
    ['/cosmos.base.v1beta1.IntProto', IntProto],
    ['/cosmos.base.v1beta1.DecProto', DecProto],
    ['/cosmos.crypto.ed25519.PubKey', PubKey],
    ['/cosmos.crypto.secp256k1.PubKey', PubKey],
    ['/cosmos.distribution.v1beta1.MsgFundCommunityPool', MsgFundCommunityPool],
    ['/cosmos.distribution.v1beta1.MsgSetWithdrawAddress', MsgSetWithdrawAddress],
    ['/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward', MsgWithdrawDelegatorReward],
    ['/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission', MsgWithdrawValidatorCommission],
    ['/cosmos.distribution.v1beta1.CommunityPoolSpendProposal', CommunityPoolSpendProposal],
    ['/cosmos.distribution.v1beta1.CommunityPoolSpendProposalWithDeposit', CommunityPoolSpendProposalWithDeposit],
    ['/cosmos.feegrant.v1beta1.MsgGrantAllowance', MsgGrantAllowance],
    ['/cosmos.feegrant.v1beta1.MsgRevokeAllowance', MsgRevokeAllowance],
    ['/cosmos.gov.v1beta1.MsgDeposit', MsgDeposit], */
    ['/cosmos.gov.v1beta1.MsgSubmitProposal', MsgSubmitProposal],
    /* ['/cosmos.gov.v1beta1.MsgVote', MsgVote],
    ['/cosmos.gov.v1beta1.Proposal', Proposal],
    ['/cosmos.gov.v1beta1.TextProposal', TextProposal],
    ['/cosmos.params.v1beta1.ParameterChangeProposal', ParameterChangeProposal],
    ['/cosmos.slashing.v1beta1.MsgUnjail', MsgUnjail],
    ['/cosmos.staking.v1beta1.MsgBeginRedelegate', MsgBeginRedelegate],
    ['/cosmos.staking.v1beta1.MsgCreateValidator', MsgCreateValidator],
    ['/cosmos.staking.v1beta1.MsgDelegate', MsgDelegate],
    ['/cosmos.staking.v1beta1.MsgEditValidator', MsgEditValidator],
    ['/cosmos.staking.v1beta1.MsgUndelegate', MsgUndelegate],
    ['/cosmos.upgrade.v1beta1.SoftwareUpgradeProposal', SoftwareUpgradeProposal],
    ['/cosmos.upgrade.v1beta1.CancelSoftwareUpgradeProposal', CancelSoftwareUpgradeProposal],
    ['/cosmos.vesting.v1beta1.BaseVestingAccount', BaseVestingAccount],
    ['/cosmos.vesting.v1beta1.ContinuousVestingAccount', ContinuousVestingAccount],
    ['/cosmos.vesting.v1beta1.DelayedVestingAccount', DelayedVestingAccount],
    ['/cosmos.vesting.v1beta1.PeriodicVestingAccount', PeriodicVestingAccount],
    ['/cosmos.vesting.v1beta1.MsgCreateVestingAccount', MsgCreateVestingAccount],
    ['/ibc.core.channel.v1.MsgChannelOpenInit', MsgChannelOpenInit],
    ['/ibc.core.channel.v1.MsgChannelOpenTry', MsgChannelOpenTry],
    ['/ibc.core.channel.v1.MsgChannelOpenAck', MsgChannelOpenAck],
    ['/ibc.core.channel.v1.MsgChannelOpenConfirm', MsgChannelOpenConfirm],
    ['/ibc.core.channel.v1.MsgChannelCloseInit', MsgChannelCloseInit],
    ['/ibc.core.channel.v1.MsgChannelCloseConfirm', MsgChannelCloseConfirm],
    ['/ibc.core.channel.v1.MsgRecvPacket', MsgRecvPacket],
    ['/ibc.core.channel.v1.MsgTimeout', MsgTimeout],
    ['/ibc.core.channel.v1.MsgTimeoutOnClose', MsgTimeoutOnClose],
    ['/ibc.core.channel.v1.MsgAcknowledgement', MsgAcknowledgement],
    ['/ibc.core.client.v1.MsgCreateClient', MsgCreateClient],
    ['/ibc.core.client.v1.MsgUpdateClient', MsgUpdateClient],
    ['/ibc.core.client.v1.MsgUpgradeClient', MsgUpgradeClient],
    ['/ibc.core.client.v1.MsgSubmitMisbehaviour', MsgSubmitMisbehaviour],
    ['/ibc.core.connection.v1.MsgConnectionOpenInit', MsgConnectionOpenInit],
    ['/ibc.core.connection.v1.MsgConnectionOpenTry', MsgConnectionOpenTry],
    ['/ibc.core.connection.v1.MsgConnectionOpenAck', MsgConnectionOpenAck],
    ['/ibc.core.connection.v1.MsgConnectionOpenConfirm', MsgConnectionOpenConfirm],
    ['/ibc.applications.transfer.v1.MsgTransfer', MsgTransfer],
    ['/lum.network.beam.MsgOpenBeam', MsgOpenBeam],
    ['/lum.network.beam.MsgUpdateBeam', MsgUpdateBeam],
    ['/lum.network.beam.MsgClaimBeam', MsgClaimBeam], */
];

const aminoConverters: AminoConverters = Object.fromEntries(Array.from(registryTypes).map((type) => { return [ type[0], {aminoType: type[0], fromAmino: type[1].decode, toAmino: type[1].encode} as AminoConverter] }))

class ExtendedRegistry extends Registry {
    decodeTx = (tx: Uint8Array): Tx => {
        return Tx.decode(tx);
    };
}

export const LumAminoRegistry = new AminoTypes(aminoConverters);
export const LumRegistry = new ExtendedRegistry();
