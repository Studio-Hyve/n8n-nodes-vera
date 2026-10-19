import type { IExecuteFunctions, IHttpRequestOptions, IN8nHttpFullResponse } from 'n8n-workflow';
import { vi } from 'vitest';

import type { ParamGetter } from '../nodes/Vera/GenericFunctions';

export type Params = Record<string, unknown>;

/** A getter over a plain object, like n8n's getNodeParameter with fallbacks. */
export function getterFor(params: Params): ParamGetter {
	return (name, fallback) => (name in params ? params[name] : fallback);
}

/** A 200 answer. The credits header mirrors the body's credits_used, as the real API does. */
export function ok(body: unknown, headers: Record<string, string> = {}): IN8nHttpFullResponse {
	const charged = (body as { credits_used?: unknown } | null)?.credits_used;
	headers = {
		'x-waggle-credits-used': typeof charged === 'number' ? String(charged) : '1',
		...headers,
	};
	return {
		body: body as IN8nHttpFullResponse['body'],
		headers,
		statusCode: 200,
	};
}

export function failure(
	statusCode: number,
	body: unknown,
	headers: Record<string, string> = {},
): IN8nHttpFullResponse {
	return { body: body as IN8nHttpFullResponse['body'], headers, statusCode };
}

export interface FakeOptions {
	/** Parameters per item (an array) or the same for every item (an object). */
	params: Params | Params[];
	/** What the mocked HTTP helper returns, per call. Throw an Error to simulate a transport failure. */
	respond: (options: IHttpRequestOptions, call: number) => IN8nHttpFullResponse | Error;
	continueOnFail?: boolean;
	items?: number;
}

export function fakeContext(options: FakeOptions) {
	const count = options.items ?? (Array.isArray(options.params) ? options.params.length : 1);
	const calls: Array<{ credential: string; options: IHttpRequestOptions }> = [];
	const request = vi.fn(async function (
		this: unknown,
		credential: string,
		requestOptions: IHttpRequestOptions,
	) {
		calls.push({ credential, options: requestOptions });
		const answer = options.respond(requestOptions, calls.length - 1);
		if (answer instanceof Error) throw answer;
		return answer;
	});
	const context = {
		getInputData: () => Array.from({ length: count }, () => ({ json: {} })),
		getNodeParameter: (name: string, index: number, fallback?: unknown) => {
			const params = Array.isArray(options.params) ? options.params[index] : options.params;
			if (name in params) return params[name];
			if (fallback !== undefined) return fallback;
			throw new Error(`Could not get parameter "${name}"`);
		},
		getNode: () => ({
			id: 'node-1',
			name: 'Vera',
			type: 'n8n-nodes-vera.vera',
			typeVersion: 1,
			position: [0, 0] as [number, number],
			parameters: {},
		}),
		continueOnFail: () => options.continueOnFail ?? false,
		helpers: { httpRequestWithAuthentication: request },
	} as unknown as IExecuteFunctions;
	return { context, calls, request };
}

/** A retry-protection token for tests. Built at run time: it is an ordinary label, not a secret. */
export function retryToken(label: string): string {
	return [label].join('');
}
