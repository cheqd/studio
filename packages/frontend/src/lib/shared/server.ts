export type ServerErrorResponse = {
	error: string;
	message: string;
};

export type GenericKV = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
};