// import {getAssetFromKV, mapRequestToAsset} from '@cloudflare/kv-asset-handler'

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

const static_cred = {
  "@context": [
    "https://www.w3.org/2018/credentials/v1"
  ],
  "id": "https://issuer.cheqd.io/credentials/1872",
  "type": ["VerifiableCredential"],
  "issuer": "did:cheqd:2222222222222222",
  "issuanceDate": new Date(),
  "credentialSubject": {
    "id": "did:key:1234567890",
    "twitter_handle": "test_twitter_handle"
  },
  "proof": {
    "type": "RsaSignature2018",
    "created": "2017-06-18T21:19:10Z",
    "proofPurpose": "assertionMethod",
    "verificationMethod": "https://example.edu/issuers/565049#key-1",
    "jws": "eyJhbGciOiJSUzI1NiIsImI2NCI6ZmFsc2UsImNyaXQiOlsiYjY0Il19..TCYt5XsITJX1CxPCT8yAV-TVkIEq_PbChOMqsLfRoPsnsgw5WEuts01mq-pQy7UJiN5mgRxD-WUcX16dUEMGlv50aqzpqh4Qktb3rk-BuQy72IFLOqV0G_zS245-kronKb78cPN25DGlcTwLtPAYuNzVBAh4vGHSrQyHUdBBPM"
  }
};

let static_json = JSON.stringify(static_cred, null, 2);

// Reference: https://developers.cloudflare.com/workers/examples/cors-header-proxy
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
}

function handleOptions (request) {
  // Make sure the necessary headers are present
  // for this to be a valid pre-flight request
  let headers = request.headers
  if (
    headers.get("Origin") !== null &&
    headers.get("Access-Control-Request-Method") !== null &&
    headers.get("Access-Control-Request-Headers") !== null
  ) {
    // Handle CORS pre-flight request.
    // If you want to check or reject the requested method + headers
    // you can do that here.
    let respHeaders = {
      ...corsHeaders,
      // Allow all future content Request headers to go back to browser
      // such as Authorization (Bearer) or X-Client-Name-Version
      "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers"),
    }
    return new Response(null, {
      headers: respHeaders,
    })
  }
  else {
    // Handle standard OPTIONS request.
    // If you want to allow other HTTP Methods, you can do that here.
    return new Response(null, {
      headers: {
        Allow: "GET, HEAD, POST, OPTIONS",
      },
    })
  }
}

addEventListener('fetch', event => {

  const {request} = event;
  let { pathname } = new URL(event.request.url);

  let response
  switch (request.method) {
    case "OPTIONS":
      response = handleOptions(request);
      break;
    case "GET":
      if (pathname === "/credential") {
        response = new Response(static_json, {
          headers: {
            'content-type': 'application/json;charset=UTF-8',
          },
        })
      }
      if (pathname === "/getBox" && request.method === 'GET') {
        response = GetFromKV(request)
      }
      break;
    case "POST":
      if (pathname === "/putBox") {
        response = PutToKVStore(request)
      }
      if (pathname === "/auth") {
        response = CheckAuthInfo(request)
      }
      break;
    default:
      response = new Response('Unexpected path/input data.')
  }

  response.headers.set("Access-Control-Allow-Origin", "*")
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  event.respondWith(response)
})

async function readRequestBody(request) {
  const { headers } = request;
  const contentType = headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return await request.json();
  } else {
    return undefined
  }
}

async function PutToKVStore(request) {
  const body = await readRequestBody(request)
  if (body === undefined) {
    return new Response("Post was rejected because wrong ContentType. JSON is expected")
  }
  await CREDENTIALS.put(JSON.stringify(body["accountID"]), JSON.stringify(body["cryptoBox"]))
  return new Response("Value has been stored")
}

// async function CheckAuthInfo(request) {
//     const body = await readRequestBody(request)
//     if (body === undefined) {
//         return new Response("Post was rejected because wrong ContentType. JSON is expected")
//     }

//     return new Response("Value has been stored")
// }

async function GetFromKV(request) {
  const body = await readRequestBody(request)
  if (body === undefined) {
    return new Response("Request was rejected because wrong ContentType. JSON is expected")
  }
  const value = await CREDENTIALS.get(JSON.stringify(body["accountID"]))
  if (value === null) {
    return new Response("Value not found", {status: 404})
  }

  return new Response(value)
}

async function readAuthRequestBody(request) {
  const { headers } = request;
  const contentType = headers.get('content-type') || ''
  if (contentType.includes('text/plain')) {
    return await request.text();
  } else {
    return ""
  }
}

async function CheckAuthInfo(request) {
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

  console.log("Result of signature verification: ", await experimentalAdr36Verify(decoded))

  return new Response( JSON.stringify( { ping: 'pong' } ) )
}

// async function handleEvent(event) {
//   let options = {}
//
//   /**
//    * You can add custom logic to how we fetch your assets
//    * by configuring the function `mapRequestToAsset`
//    */
//   // options.mapRequestToAsset = handlePrefix(/^\/docs/)
//
//   try {
//     if (DEBUG) {
//       // customize caching
//       options.cacheControl = {
//         bypassCache: true,
//       }
//     }
//
//     const page = await getAssetFromKV(event, options)
//
//     // allow headers to be altered
//     const response = new Response(page.body, page)
//
//     response.headers.set('X-XSS-Protection', '1; mode=block')
//     response.headers.set('X-Content-Type-Options', 'nosniff')
//     response.headers.set('X-Frame-Options', 'DENY')
//     response.headers.set('Referrer-Policy', 'unsafe-url')
//     response.headers.set('Feature-Policy', 'none')
//
//     return response
//
//   } catch (e) {
//     // if an error is thrown try to serve the asset at 404.html
//     if (!DEBUG) {
//       try {
//         let notFoundResponse = await getAssetFromKV(event, {
//           mapRequestToAsset: req => new Request(`${new URL(req.url).origin}/404.html`, req),
//         })
//
//         return new Response(notFoundResponse.body, { ...notFoundResponse, status: 404 })
//       } catch (e) {}
//     }
//
//     return new Response(e.message || e.toString(), { status: 500 })
//   }
// }

// /**
//  * Here's one example of how to modify a request to
//  * remove a specific prefix, in this case `/docs` from
//  * the url. This can be useful if you are deploying to a
//  * route on a zone, or if you only want your static content
//  * to exist at a specific path.
//  */
// function handlePrefix(prefix) {
//   return request => {
//     // compute the default (e.g. / -> index.html)
//     let defaultAssetKey = mapRequestToAsset(request)
//     let url = new URL(defaultAssetKey.url)
//
//     // strip the prefix from the path for lookup
//     url.pathname = url.pathname.replace(prefix, '/')
//
//     // inherit all other props from the default request
//     return new Request(url.toString(), defaultAssetKey)
//   }
// }

async function experimentalAdr36Verify(signed) {
  // Restrictions from ADR-036
  // if (signed.memo !== "") throw new Error("Memo must be empty.");
  // if (signed.fee.gas !== "0") throw new Error("Fee gas must 0.");
  // if (signed.fee.amount.length !== 0) throw new Error("Fee amount must be an empty array.");

  const accountNumber = 0;
  const sequence = 0;
  const chainId = "";

  // Check `msg` array
  const signedMessages = signed.msg;
  if (!signedMessages.every(isMsgSignData)) {
    throw new Error(`Found message that is not the expected type.`);
  }
  if (signedMessages.length === 0) {
    throw new Error("No message found. Without messages we cannot determine the signer address.");
  }
  // TODO: restrict number of messages?

  const signatures = signed.signatures;
  if (signatures.length !== 1) throw new Error("Must have exactly one signature to be supported.");
  const signature = signatures[0];
  if (!isSecp256k1Pubkey(signature.pub_key)) {
    throw new Error("Only secp256k1 signatures are supported.");
  }

  const signBytes = serializeSignDoc(
    makeSignDocAmino(signed.msg, signed.fee, chainId, signed.memo, accountNumber, sequence),
  );
  const prehashed = sha256(signBytes);

  const secpSignature = Secp256k1Signature.fromFixedLength(fromBase64(signature.signature));
  const rawSecp256k1Pubkey = fromBase64(signature.pub_key.value);
  const rawSignerAddress = rawSecp256k1PubkeyToRawAddress(rawSecp256k1Pubkey);

  if (
    signedMessages.some(
      (msg) => !arrayContentEquals(Bech32.decode(msg.value.signer).data, rawSignerAddress),
    )
  ) {
    throw new Error("Found mismatch between signer in message and public key");
  }

  const ok = await Secp256k1.verifySignature(secpSignature, prehashed, rawSecp256k1Pubkey);
  return ok;
}