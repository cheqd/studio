export type APISuccessResponse<Output> = {
	success: true;
	status: number;
	data: Output;
};

export type APIErrorResponse<Input> = {
	success: false;
	status: number;
	error: Input;
	data?: any;
};

export type SafeAPIResponse<Output, Input = string> = APISuccessResponse<Output> | APIErrorResponse<Input>;
