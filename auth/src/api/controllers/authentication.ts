import { decodePubkey, decodeTxRaw, DecodedTxRaw, EncodeObject } from '@cosmjs/proto-signing'
import { fromBase64 } from '@cosmjs/encoding'
import { LumAminoRegistry, LumRegistry } from '../helpers/registry'
import { generateSignDoc, generateSignDocBytes, verifySignature } from '../helpers/utils'
import { SignMode, Doc, Fee } from '../types'
import { serializeSignDoc } from '@cosmjs/amino'
import Long from 'long'

import { Client, auth } from 'twitter-api-sdk'

import { HEADERS, PROPOSAL_MESSAGE_TITLE as TITLE, REPLY_PROTECTION_INTERVAL, TWITTER_CONSUMER_KEY, TWITTER_CONSUMER_SECRET, TWITTER_STATE_CSRF } from '../constants'
import { GenerateAuthUrlOptions, OAuth2User, OAuth2UserOptions } from 'twitter-api-sdk/dist/OAuth2User'

export const handleAuthRequest = async (request: Request): Promise<Response> => {
  console.log('Request', JSON.stringify(request));
  const token = await getAuthToken(request);
  if (token === '') {
    return makeResponse("Body is empty!")
  }
  const res = await handleAuthToken(token);
  return makeResponse(res.toString())
}

async function getAuthToken(request: Request): Promise<string> {
  const { headers } = request;
  const contentType = headers.get('content-type') || ''
  if (contentType.includes('text/plain')) {
    return await request.text();
  } else {
    return ""
  }
}

export const handleAuthToken = async (token: string): Promise<boolean> => {
  const byte_array = fromBase64(token)
  const chainId = 'cheqd-mainnet-1';
  const decoded = decodeTxRaw(byte_array);
  // Check that TextProposal has expected title and was created not more then 30 seconds ago.
  // const isMsgValid = checkMsg(decoded);
  // if (!isMsgValid) {
  //   return makeResponse("Message inside thte token is invalid");
  // }

  // Get the signature from decoded message
  const signature = decoded.signatures[0];
  // Get public key
  const raw_pubkey = getPubkey(decoded);
  if (raw_pubkey == null) {
    return false;
  }

  // Get sign mode
  const signMode = getSignMode(decoded);
  if (signMode === undefined) {
    console.log('Sign mode is undefined')
    return false
  }
  // Get the doc
  const doc = compileDoc(decoded, chainId, raw_pubkey);
  if (doc == null) {
    return false
  }
  // Check the signature
  let ok = false;
  if (signMode === SignMode.SIGN_MODE_DIRECT) {
    const signDoc = generateSignDoc(doc, 0, signMode);
    const sortedJSON = {
      accountNumber: signDoc.accountNumber,
      authInfoBytes: signDoc.authInfoBytes,
      bodyBytes: signDoc.bodyBytes,
      chainId: signDoc.chainId,
    };
    const signed_bytes = generateSignDocBytes(sortedJSON);
    ok = await verifySignature(signature, signed_bytes, raw_pubkey);
  } else if (signMode === SignMode.SIGN_MODE_LEGACY_AMINO_JSON) {
    const amino_doc_bytes = serializeSignDoc({
      account_number: doc.signers[0].accountNumber.toString(),
      chain_id: doc.chainId,
      fee: doc.fee,
      memo: doc.memo || '',
      msgs: doc.messages.map((msg: EncodeObject) => LumAminoRegistry.toAmino(msg)),
      sequence: doc.signers[0].sequence.toString(),
    });
    ok = await verifySignature(signature, amino_doc_bytes, raw_pubkey);
  }

  return ok
};

// Utils

function checkMsg(decoded: DecodedTxRaw): boolean {
  const message = LumRegistry.decode(decoded.body.messages[0]);
  const proposalMsg = LumRegistry.decode(message.content);
  const description = JSON.parse(proposalMsg.description);
  if (proposalMsg.title !== TITLE) {
    return false;
  }

  return Date.now() - Date.parse(description.time) <= REPLY_PROTECTION_INTERVAL;

}

function getPubkey(decoded: DecodedTxRaw): Uint8Array | null {
  const pubkey = decodePubkey(decoded.authInfo.signerInfos[0].publicKey);
  if (pubkey == null) {
    return null;
  }

  return fromBase64(pubkey.value);
}

function compileDoc(decoded: DecodedTxRaw, chainId: string, raw_pubkey: Uint8Array): Doc | null {
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

function compileFee(decoded: DecodedTxRaw): Fee | null {
  if (decoded.authInfo.fee === undefined) {
    throw new Error('Fee is not set.');
  }
  // Get the gas value
  const _gas = new Long(
    decoded.authInfo.fee.gasLimit.low,
    decoded.authInfo.fee.gasLimit.high,
    decoded.authInfo.fee.gasLimit.unsigned,
  );
  return {
    amount: decoded.authInfo.fee.amount,
    gas: _gas.toString()
  };
}

function getSignMode(decoded: DecodedTxRaw): number | undefined {
  return decoded.authInfo.signerInfos[0].modeInfo?.single?.mode;
}

function makeResponse(result: string): Response {
  return new Response(
    JSON.stringify(
      {
        result: result
      }
    ), 
    {
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
    }
  )
}

export type TwitterClient = { client: Client, auth_client: OAuth2User }

const initialise_twitter_client = (): TwitterClient  => {
  const auth_client = new auth.OAuth2User({
    client_id: TWITTER_CONSUMER_KEY as string,
    client_secret: TWITTER_CONSUMER_SECRET as string,
    callback: 'https://identity-apis.cheqd.network/api/authentication/twitter/callback',
    scopes: [ 'users.read' ]
  } as OAuth2UserOptions)

  return { client: new Client(auth_client), auth_client: auth_client}
}

export const callback_twitter_auth = async (request: Request): Promise<Response> => {
  const { client, auth_client } = initialise_twitter_client()
  try{
    const url_query_params = new URLSearchParams( request.url )

    const code = url_query_params.get('code')
    const state = url_query_params.get('state')

    if( state != TWITTER_STATE_CSRF ) return new Response( JSON.stringify( { error: 'Non matching states.' } ), { status: 400, headers: { ...HEADERS.json } } )

    if( !code ) return new Response( JSON.stringify( { error: 'Code is not provided.' } ), { status: 400, headers: { ...HEADERS.json } } )

    await auth_client.requestAccessToken( code as string )

    const user = client.users.findMyUser()

    return new Response(
      JSON.stringify(
        { twitter_user: user }
      ),
      {
        headers: { ...HEADERS.json }
      }
    )

  } catch ( error ) {
    console.error( error )
    return new Response( JSON.stringify( { error: error } ), { status: 500, headers: { ...HEADERS.json } } )
  }
}

export const twitter_auth = async (request: Request): Promise<Response> => {
  const { client, auth_client } = initialise_twitter_client()

  const auth_url = auth_client.generateAuthURL({
    state: TWITTER_STATE_CSRF as string,
    code_challenge_method: 's256'
  } as GenerateAuthUrlOptions)

  return new Response(
    JSON.stringify(
      {
        auth_url: auth_url
      }
    ),
    {
      headers: { ...HEADERS.json }
    }
  )
}
