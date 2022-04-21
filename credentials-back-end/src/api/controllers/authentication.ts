import { decodePubkey, decodeTxRaw } from '@cosmjs/proto-signing'
import { fromBase64 } from '@cosmjs/encoding'
import { LumAminoRegistry, LumRegistry, LumUtils } from '@lum-network/sdk-javascript';
import { SignMode } from '@lum-network/sdk-javascript/build/codec/cosmos/tx/signing/v1beta1/signing';
import { serializeSignDoc } from '@cosmjs/amino';
import Long from 'long';

// constants
const TITLE = 'AuthRequest';
const REPLY_PROTECTION_INTERVAL = 30;


const handleAuthRequest = async (request: Request): Promise<Response> => {
  console.log('Request', JSON.stringify(request));
  const body = await readAuthRequestBody(request);
  if (body === '') {
    return makeResponse("Body is empty!")
  }
  const data = fromBase64(body);
  const ok = await handleAuthToken(data);
  return makeResponse(ok.toString())
}

async function readAuthRequestBody(request: Request): Promise<string> {
  const { headers } = request;
  const contentType = headers.get('content-type') || ''
  if (contentType.includes('text/plain')) {
    return await request.text();
  } else {
    return ""
  }
}

const handleAuthToken = async (token: Uint8Array): Promise<boolean> => {
  const chainId = 'cheqd-testnet-4';
  const decoded = decodeTxRaw(token);
  // Check that TextProposal has expected title and was created not more then 30 seconds ago.
  const isMsgValid = checkMsg(decoded);
  if (!isMsgValid) {
    return false;
  }

  // Get the signature from decoded message
  const signature = decoded.signatures[0];
  // Get public key
  const raw_pubkey = getPubkey(decoded);
  if (raw_pubkey == null) {
    console.log('Pubkey is null');
    return false;
  }

  // Get sign mode
  const signMode = getSignMode(decoded);
  if (signMode === undefined) {
    console.log('Sign mode is undefined')
    return false;
  }
  // Get the doc
  const doc = compileDoc(decoded, chainId, raw_pubkey);
  if (doc == null) {
    return false;
  }
  // Check the signature
  let ok = false;
  if (signMode === SignMode.SIGN_MODE_DIRECT) {
    const signDoc = LumUtils.generateSignDoc(doc, 0, signMode);
    const sortedJSON = {
      accountNumber: signDoc.accountNumber,
      authInfoBytes: signDoc.authInfoBytes,
      bodyBytes: signDoc.bodyBytes,
      chainId: signDoc.chainId,
    };
    const signed_bytes = LumUtils.generateSignDocBytes(sortedJSON);
    ok = await LumUtils.verifySignature(signature, signed_bytes, raw_pubkey);
  } else if (signMode === SignMode.SIGN_MODE_LEGACY_AMINO_JSON) {
    const amino_doc_bytes = serializeSignDoc({
      account_number: doc.signers[0].accountNumber.toString(),
      chain_id: doc.chainId,
      fee: doc.fee,
      memo: doc.memo || '',
      msgs: doc.messages.map((msg: any) => LumAminoRegistry.toAmino(msg)),
      sequence: doc.signers[0].sequence.toString(),
    });
    ok = await LumUtils.verifySignature(signature, amino_doc_bytes, raw_pubkey);
  }

  return ok;
};

// Utils

function checkMsg(decoded: any): boolean {
  const message = LumRegistry.decode(decoded.body.messages[0]);
  const proposalMsg = LumRegistry.decode(message.content);
  const description = JSON.parse(proposalMsg.description);
  if (proposalMsg.title !== TITLE) {
    return false;
  }

  return Date.now() - Date.parse(description.time) <= REPLY_PROTECTION_INTERVAL;

}

function getPubkey(decoded: any): Uint8Array | null {
  const pubkey = decodePubkey(decoded.authInfo.signerInfos[0].publicKey);
  if (pubkey == null) {
    return null;
  }

  return fromBase64(pubkey.value);
}

function compileDoc(decoded: any, chainId: string, raw_pubkey: Uint8Array): any | null {
  const message = LumRegistry.decode(decoded.body.messages[0]);
  // Compile fee object
  const fee = compileFee(decoded);
  if (fee == null) {
    return null;
  }
  // Compile docSigner
  const docSigner = {
    accountNumber: 0,
    sequence: 0,
    publicKey: raw_pubkey,
  };
  return {
    chainId: chainId,
    fee: fee,
    memo: decoded.body.memo,
    messages: [
      {
        typeUrl: decoded.body.messages[0].typeUrl,
        value: message,
      },
    ],
    signers: [docSigner],
  };
}

function compileFee(decoded: any): any | null {
  if (decoded.authInfo.fee === undefined) {
    return false;
  }
  // Get the gas value
  const _gas = new Long(
    decoded.authInfo.fee.gasLimit.low,
    decoded.authInfo.fee.gasLimit.high,
    decoded.authInfo.fee.gasLimit.unsigned,
  );
  return {
    amount: decoded.authInfo.fee.amount,
    gas: _gas.toString(),
  };
}

function getSignMode(decoded: any): number | undefined {
  return decoded.authInfo.signerInfos[0].modeInfo?.single?.mode;
}

function makeResponse(result: string): Response {
  return new Response(
    JSON.stringify({result: result}), {
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
    })
}

export default handleAuthRequest