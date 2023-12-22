export interface IHelpers {
	isUnique(arr: string[]): boolean;
}

export class Helpers implements IHelpers {
	isUnique(arr: string[]): boolean {
		return arr.length === new Set(arr).size;
	}
}
