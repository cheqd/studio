import { PubKey } from './codecs/secp256k1';
import { Any } from './codecs/any';

/**
 * Converts a public key into its protorpc version
 *
 * @param publicKey public key to convert into proto
 */
export const publicKeyToProto = (publicKey: Uint8Array): Any => {
    const pubkeyProto = PubKey.fromPartial({ key: publicKey });
    return Any.fromPartial({
        typeUrl: '/cosmos.crypto.secp256k1.PubKey',
        value: Uint8Array.from(PubKey.encode(pubkeyProto).finish()),
    });
};
