export const categoryEnum = {
	DID: 'did',
	RESOURCE: 'resource',
	CREDENTIAL: 'credential',
	CREDENTIAL_STATUS: 'credential-status',
	PRESENTATION: 'presentation',
	KEY: 'key',

	toStringList: function (): string[] {
		return [this.DID, this.RESOURCE, this.CREDENTIAL, this.CREDENTIAL_STATUS, this.PRESENTATION, this.KEY];
	},
};

export const namespaceEnum = {
	TESTNET: 'testnet',
	MAINNET: 'mainnet',

	toStringList: function (): string[] {
		return [this.TESTNET, this.MAINNET];
	},
};

export const directionEnum = {
	INBOUND: 'inbound',
	OUTBOUND: 'outbound',

	toStringList: function (): string[] {
		return [this.INBOUND, this.OUTBOUND];
	},
};
