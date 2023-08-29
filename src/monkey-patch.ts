/* eslint-disable @typescript-eslint/no-explicit-any */
export const JSONStringify = (obj: Record<string, any> | null) => {
	const isArray = (value: Record<string, any> | null) => {
		return Array.isArray(value) && typeof value === 'object';
	};

	const isObject = (value: Record<string, any> | null) => {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	};

	const isString = (value: Record<string, any> | null) => {
		return typeof value === 'string';
	};

	const isBoolean = (value: Record<string, any> | null) => {
		return typeof value === 'boolean';
	};

	const isNumber = (value: Record<string, any> | null) => {
		return typeof value === 'number';
	};

	const isNull = (value: Record<string, any> | null) => {
		return value === null && typeof value === 'object';
	};

	const isNotNumber = (value: Record<string, any> | null) => {
		return typeof value === 'number' && isNaN(value);
	};

	const isInfinity = (value: Record<string, any> | null) => {
		return typeof value === 'number' && !isFinite(value);
	};

	const isDate = (value: Record<string, any> | null) => {
		return typeof value === 'object' && value !== null && typeof value.getMonth === 'function';
	};

	const isUndefined = (value: Record<string, any> | null) => {
		return value === undefined && typeof value === 'undefined';
	};

	const isFunction = (value: Record<string, any> | null) => {
		return typeof value === 'function';
	};

	const isSymbol = (value: Record<string, any> | null) => {
		return typeof value === 'symbol';
	};

	const restOfDataTypes = (value: Record<string, any> | null) => {
		return isNumber(value) || isString(value) || isBoolean(value);
	};

	const ignoreDataTypes = (value: Record<string, any> | null) => {
		return isUndefined(value) || isFunction(value) || isSymbol(value);
	};

	const nullDataTypes = (value: Record<string, any> | null) => {
		return isNotNumber(value) || isInfinity(value) || isNull(value);
	};

	const arrayValuesNullTypes = (value: Record<string, any>) => {
		return isNotNumber(value) || isInfinity(value) || isNull(value) || ignoreDataTypes(value);
	};

	const removeComma = (str: string) => {
		const tempArr = str.split('');
		tempArr.pop();
		return tempArr.join('');
	};

	const escape = (str: string) => {
		return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	};

	if (ignoreDataTypes(obj)) {
		return undefined;
	}

	if (isDate(obj)) {
		return `"${obj?.toISOString()}"`;
	}

	if (nullDataTypes(obj)) {
		return `${null}`;
	}

	if (isSymbol(obj)) {
		return undefined;
	}

	if (restOfDataTypes(obj)) {
		const passQuotes = isString(obj) ? `"` : '';
		return `${passQuotes}${isString(obj) ? escape(obj as unknown as string) : obj }${passQuotes}`;
	}

	if (isArray(obj)) {
		let arrStr = '';
		obj?.forEach((eachValue: any) => {
			arrStr += arrayValuesNullTypes(eachValue) ? JSONStringify(null) : JSONStringify(eachValue);
			arrStr += ',';
		});

		return `[` + removeComma(arrStr) + `]`;
	}

	if (isObject(obj)) {
		let objStr = '';

		const objKeys = Object.keys(obj || {});

		objKeys.forEach((eachKey) => {
			const eachValue = obj?.[eachKey];
			objStr += !ignoreDataTypes(eachValue) ? `"${eachKey}":${JSONStringify(eachValue)},` : '';
		});
		return `{` + removeComma(objStr) + `}`;
	}

	return undefined;
};
