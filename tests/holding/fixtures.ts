import type { DIDDocument, DIDResolutionResult } from "did-resolver"
import {test as base, expect } from '@playwright/test';

type WorkerScopedDIDFixture = {
    DIDRepository: DIDFixture,
};

export class HTTPHelper {
    async post (path: string, data: any, headers: any): Promise<Response> {
        const response = await fetch(
            process.env.APPLICATION_BASE_URL + path, 
            {
                body: data,
                headers: headers,
                method: 'POST',
            }
        );
        return response;
    }

    async get (path: string, headers: any): Promise<Response> {
        const response = await fetch(
            path, 
            {
                headers: headers,
                method: 'GET',
            }
        );
        return response;
    }

    async put (path: string, data: any, headers: any): Promise<Response> {
        const response = await fetch(
            process.env.APPLICATION_BASE_URL + path, 
            {
                body: JSON.stringify(data),
                headers: headers,
                method: 'PUT',
            }
        );
        return response;
    }

    async patch(path: string, data: any, headers: any): Promise<Response> {
        const response = await fetch(
            process.env.APPLICATION_BASE_URL + path, 
            {
                body: JSON.stringify(data),
                headers: headers,
                method: 'PATCH',
            }
        );
        return response;
    }
}

export class DIDFixture extends HTTPHelper {
    did: string;
    didDocument: DIDDocument;

    constructor() {
        super();
        this.did = "";
        this.didDocument = {} as DIDDocument;
    }
    async createDid(network='testnet'): Promise<string> {
        const response = await this.post(
            `/did/create`, 
            JSON.stringify({
                    "methodSpecificIdAlgo": "uuid",
                    "verificationMethodType": "Ed25519VerificationKey2018",
                    "assertionMethod": true,
                    "network": network,
            }),
            {
                "Content-Type": "application/json",
            }
        );
        if (!response.ok) {
            console.error(await response.text());
        }
        console.error(await response.text());
        const body = await response.json();
        this.did = body.did;
        return body.did;
    }

    async resolveDid(DIDString: string): Promise<DIDResolutionResult> {
        const response = await this.get(`/did/search/${DIDString}`, {});
        if (!response.ok) {
            console.error(await response.text());
        }
        const body = await response.json();
        this.didDocument = body.didDocument;
        return body;
    }
}

// eslint-disable-next-line @typescript-eslint/ban-types
export const test = base.extend<{}, WorkerScopedDIDFixture>({

   DIDRepository: [
    async ({ browser }, use) => {
        expect(browser.isConnected()).toBeTruthy();
        const didFixture = new DIDFixture();
        await didFixture.createDid();
        await use(didFixture);
    }, 
    { scope: 'worker'}]
})
