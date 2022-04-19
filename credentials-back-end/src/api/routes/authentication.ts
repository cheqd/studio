import { Request, Router } from 'itty-router'

import { defaultRegistryTypes } from "@cosmjs/stargate";
import { decodeTxRaw, Registry } from "@cosmjs/proto-signing"

import {
  isSecp256k1Pubkey,
  makeSignDoc as makeSignDocAmino,
  rawSecp256k1PubkeyToRawAddress,
  serializeSignDoc,
} from "@cosmjs/amino";
import { Secp256k1, Secp256k1Signature, sha256 } from "@cosmjs/crypto";
import { Bech32, fromBase64 } from "@cosmjs/encoding";

const router = Router({ base: '/api/authentication' })

router.all(
    '/',
    () => new Response( JSON.stringify( { ping: 'pong' } ) )
)

async function readAuthRequestBody(request: Request) {
  // @ts-ignore
  const { headers } = request;
  const contentType = headers.get('content-type') || ''
  if (contentType.includes('text/plain')) {
    // @ts-ignore
    return await request.text();
  } else {
    return ""
  }
}

async function CheckAuthInfo(request: Request) {
  const body = await readAuthRequestBody(request);
  // console.log("Body after parsing HTML: ", body);
  const body_str = "ClEKTwolL2Nvc21vcy5nb3YudjFiZXRhMS5Nc2dTdWJtaXRQcm9wb3NhbBImCiQKIC9jb3Ntb3MuZ292LnYxYmV0YTEuVGV4dFByb3Bvc2FsEgASYApOCkYKHy9jb3Ntb3MuY3J5cHRvLnNlY3AyNTZrMS5QdWJLZXkSIwohA5Z0cap3GEvq60O3jASn07tRQauuA45G736O6mFbTUt7EgQKAgh/Eg4KCgoFbmNoZXESATAQARpAjxsypQaDrWcdEJE3XJuz7t493t+DohzECHESM0KVPX0A4PGGRn6Xw6KC/RM4RNPrJ23wYtR/M5n9dlQz5Mg12w=="
  const data = fromBase64(body);
  const decoded = decodeTxRaw(data);

  const registry = new Registry(defaultRegistryTypes);
  for (const message of decoded.body.messages) {
    console.log("Message: ", registry.decode(message));
  }

  console.log("AsJSON: ", JSON.stringify(decoded))

  console.log("Body: ", decoded.body)
  console.log("AuthInfo: ", decoded.authInfo)
  console.log("Signatures: ", decoded.signatures)

  // console.log("Result of signature verification: ", await experimentalAdr36Verify(decoded))

  return new Response( JSON.stringify( { ping: 'pong' } ) )
}

export default router