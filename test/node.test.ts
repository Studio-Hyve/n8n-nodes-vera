import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { Vera } from '../nodes/Vera/Vera.node';
import { failure, retryToken, fakeContext, ok } from './helpers';

const run = (context: ReturnType<typeof fakeContext>['context']) =>
	new Vera().execute.call(context);

describe('Vera node execute (HTTP mocked)', () => {
	it('Scrape Page: posts the built request with the veraApi credential and returns JSON plus credits', async () => {
		const body = {
			request_id: 'req_1',
			data: { markdown: '# Hello' },
			credits_used: 1,
			elapsed_ms: 300,
		};
		const { context, calls } = fakeContext({
			params: { resource: 'page', operation: 'scrape', url: 'https://example.com' },
			respond: () => ok(body),
		});

		const [items] = await run(context);

		expect(calls).toHaveLength(1);
		expect(calls[0].credential).toBe('veraApi');
		expect(calls[0].options).toMatchObject({
			method: 'POST',
			url: 'https://vera.waggle.ae/v1/scrape',
			body: { url: 'https://example.com', response_format: 'markdown' },
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
		});
		expect(items).toEqual([{ json: body, pairedItem: { item: 0 } }]);
		expect(items[0].json.credits_used).toBe(1);
	});

	it('Scrape Page with rendering reports the 5 credits the API settled', async () => {
		const { context, calls } = fakeContext({
			params: { operation: 'scrape', url: 'https://spa.example.com', render: true },
			respond: () =>
				ok({ data: { markdown: 'x' }, credits_used: 5 }, { 'x-waggle-credits-used': '5' }),
		});
		const [items] = await run(context);
		expect(calls[0].options.body).toMatchObject({ render: true });
		expect(items[0].json.credits_used).toBe(5);
	});

	it.each([
		['webSearch', '/search', 3],
		['newsSearch', '/search/news', 3],
		['videoSearch', '/search/videos', 3],
	] as const)('%s posts to %s and returns %s credits', async (operation, path, credits) => {
		const { context, calls } = fakeContext({
			params: { operation, query: 'vera scraping', limit: 5 },
			respond: () => ok({ data: { results: [{ position: 1 }] }, credits_used: credits }),
		});
		const [items] = await run(context);
		expect(calls[0].options.url).toBe(`https://vera.waggle.ae/v1${path}`);
		expect(calls[0].options.body).toEqual({ query: 'vera scraping', limit: 5 });
		expect(items[0].json).toMatchObject({
			credits_used: credits,
			data: { results: [{ position: 1 }] },
		});
	});

	it('Extract Contacts and Extract Products post to their endpoints', async () => {
		const contacts = fakeContext({
			params: { operation: 'extractContacts', url: 'https://example.com/contact' },
			respond: () => ok({ data: { emails: [] }, credits_used: 1 }),
		});
		await run(contacts.context);
		expect(contacts.calls[0].options.url).toBe('https://vera.waggle.ae/v1/contacts');

		const products = fakeContext({
			params: {
				operation: 'extractProducts',
				url: 'https://shop.example.com/p',
				marketplace: 'amazon',
			},
			respond: () => ok({ data: { products: [] }, credits_used: 1 }),
		});
		await run(products.context);
		expect(products.calls[0].options.url).toBe('https://vera.waggle.ae/v1/products');
		expect(products.calls[0].options.body).toEqual({
			url: 'https://shop.example.com/p',
			marketplace: 'amazon',
		});
	});

	it('sends the Idempotency-Key header', async () => {
		const { context, calls } = fakeContext({
			params: {
				operation: 'extractContacts',
				url: 'https://example.com',
				options: { idempotencyKey: retryToken('run-2026-01-01-item-0000') },
			},
			respond: () => ok({ data: {}, credits_used: 0 }),
		});
		await run(context);
		expect(calls[0].options.headers).toMatchObject({
			'Idempotency-Key': retryToken('run-2026-01-01-item-0000'),
		});
	});

	it('makes one request per input item, paired to its item', async () => {
		const { context, calls } = fakeContext({
			params: [
				{ operation: 'extractContacts', url: 'https://a.example.com' },
				{ operation: 'extractContacts', url: 'https://b.example.com' },
				{ operation: 'extractContacts', url: 'https://c.example.com' },
			],
			respond: (options) =>
				ok({ data: { url: (options.body as { url: string }).url }, credits_used: 1 }),
		});
		const [items] = await run(context);
		expect(calls.map((call) => (call.options.body as { url: string }).url)).toEqual([
			'https://a.example.com',
			'https://b.example.com',
			'https://c.example.com',
		]);
		expect(items.map((item) => item.pairedItem)).toEqual([{ item: 0 }, { item: 1 }, { item: 2 }]);
	});

	it('throws a NodeApiError with the status and advice for an API failure', async () => {
		const { context } = fakeContext({
			params: { operation: 'webSearch', query: 'q', limit: 5 },
			respond: () =>
				failure(
					402,
					{ error: { message: 'This request requires 3 credits.' } },
					{ 'x-waggle-credits-used': '0' },
				),
		});
		const error = await run(context).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(NodeApiError);
		const apiError = error as NodeApiError;
		expect(apiError.message).toBe('Not enough Vera credits');
		expect(apiError.httpCode).toBe('402');
		expect(apiError.description).toContain('This request requires 3 credits.');
		expect(apiError.description).toContain('No credits were charged.');
		expect(apiError.context.itemIndex).toBe(0);
	});

	it('throws a NodeOperationError for invalid parameters and sends no request', async () => {
		const { context, request } = fakeContext({
			params: { operation: 'scrape', url: 'not-a-url' },
			respond: () => ok({}),
		});
		const error = await run(context).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(NodeOperationError);
		expect((error as NodeOperationError).message).toBe('URL must start with http:// or https://');
		expect(request).not.toHaveBeenCalled();
	});

	it('wraps a transport failure in a NodeApiError', async () => {
		const { context } = fakeContext({
			params: { operation: 'extractContacts', url: 'https://example.com' },
			respond: () => new Error('connect ECONNREFUSED'),
		});
		const error = await run(context).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as NodeApiError).message).toMatch(/refused the connection/);
		expect((error as NodeApiError).description).toContain('did not complete');
	});

	it('Continue on Fail: emits an error item per failure and keeps going', async () => {
		const { context, calls } = fakeContext({
			continueOnFail: true,
			params: [
				{ operation: 'extractContacts', url: 'https://a.example.com' },
				{ operation: 'extractContacts', url: 'https://b.example.com' },
				{ operation: 'extractContacts', url: 'bad' },
			],
			respond: (_options, call) =>
				call === 0
					? failure(
							429,
							{ error: { message: 'Too many requests.' } },
							{ 'retry-after': '30', 'x-waggle-credits-used': '0' },
						)
					: ok({ data: { emails: [] }, credits_used: 1 }),
		});
		const [items] = await run(context);
		expect(calls).toHaveLength(2);
		expect(items).toHaveLength(3);
		expect(items[0].json).toMatchObject({
			error: 'Vera rate limit reached',
			status_code: 429,
			retry_after_seconds: 30,
		});
		expect(items[1].json).toMatchObject({ credits_used: 1 });
		expect(items[2].json).toMatchObject({ error: 'URL must start with http:// or https://' });
		expect(items.map((item) => item.pairedItem)).toEqual([{ item: 0 }, { item: 1 }, { item: 2 }]);
	});
});

describe('Vera node execute: the search tools (HTTP mocked)', () => {
	const cases = [
		{
			operation: 'serpSearch',
			params: { query: 'best coffee in dubai', engine: 'bing', depth: 20 },
			url: 'https://vera.waggle.ae/v1/serp/bing',
			body: { q: 'best coffee in dubai', depth: 20 },
			timeout: 50_000,
			credits: 6,
		},
		{
			operation: 'keywordIdeas',
			params: { seed: 'specialty coffee' },
			url: 'https://vera.waggle.ae/v1/keywords/ideas',
			body: { seed: 'specialty coffee', limit: 50, expand: 'questions' },
			timeout: 80_000,
			credits: 30,
		},
		{
			operation: 'aiAnswers',
			params: { prompt: 'Best roasters in Dubai?', brand: 'Roasters' },
			url: 'https://vera.waggle.ae/v1/ai/answers',
			body: {
				prompt: 'Best roasters in Dubai?',
				brand: 'Roasters',
				engines: ['chatgpt'],
				samples: 1,
			},
			timeout: 175_000,
			credits: 200,
		},
		{
			operation: 'geoQueryRadar',
			params: { query: 'best roasters in dubai', brand: 'Roasters' },
			url: 'https://vera.waggle.ae/v1/geo/radar/query',
			body: { query: 'best roasters in dubai', brand: 'Roasters', depth: 30 },
			timeout: 80_000,
			credits: 6,
		},
		{
			operation: 'companyFootprint',
			params: { company: 'Roasters' },
			url: 'https://vera.waggle.ae/v1/company/footprint',
			body: { company: 'Roasters', depth: 20 },
			timeout: 65_000,
			credits: 3,
		},
	] as const;

	it.each(cases)(
		'$operation posts to $url with a $timeout ms timeout and shows the $credits credits charged',
		async ({ operation, params, url, body, timeout, credits }) => {
			const answer = {
				request_id: 'req_tool',
				data: { status: 'success' },
				credits_used: credits,
				elapsed_ms: 1800,
			};
			const { context, calls } = fakeContext({
				params: { operation, ...params },
				respond: () => ok(answer, { 'x-waggle-credits-used': String(credits) }),
			});
			const [items] = await run(context);
			expect(calls).toHaveLength(1);
			expect(calls[0].credential).toBe('veraApi');
			expect(calls[0].options).toMatchObject({ method: 'POST', url, body, timeout });
			expect(items).toEqual([{ json: answer, pairedItem: { item: 0 } }]);
			expect(items[0].json.credits_used).toBe(credits);
		},
	);

	it('shows the charge from the header when a cached search cost less than the hold', async () => {
		const { context } = fakeContext({
			params: { operation: 'serpSearch', query: 'q', depth: 10 },
			respond: () =>
				ok(
					{ data: {}, credits_used: 3 },
					{ 'x-waggle-credits-used': '1', 'x-waggle-request-id': 'req_c' },
				),
		});
		const [items] = await run(context);
		expect(items[0].json).toMatchObject({ credits_used: 1 });
	});

	it('sends requests to the Base URL of the credential', async () => {
		const { context, calls } = fakeContext({
			baseUrl: 'https://staging.vera.example/v1/',
			params: { operation: 'webSearch', query: 'q', limit: 3 },
			respond: () => ok({ data: { results: [] }, credits_used: 3 }),
		});
		await run(context);
		expect(calls[0].options.url).toBe('https://staging.vera.example/v1/search');
	});

	it('refuses an insecure Base URL before sending anything, even with Continue on Fail', async () => {
		const { context, request } = fakeContext({
			baseUrl: 'http://vera.example/v1',
			continueOnFail: true,
			params: { operation: 'webSearch', query: 'q', limit: 3 },
			respond: () => ok({}),
		});
		const [items] = await run(context);
		expect(request).not.toHaveBeenCalled();
		expect(items[0].json.error).toMatch(/must use https/);
	});

	it('504 raises "Vera timed out", not charged', async () => {
		const { context } = fakeContext({
			params: { operation: 'aiAnswers', prompt: 'p', brand: 'b' },
			respond: () =>
				failure(
					504,
					{
						error: {
							message:
								'The service behind this tool took too long to answer. You were not charged.',
						},
					},
					{ 'x-waggle-credits-used': '0' },
				),
		});
		const error = (await run(context).catch((caught: unknown) => caught)) as NodeApiError;
		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toBe('Vera timed out');
		expect(error.httpCode).toBe('504');
		expect(error.description).toContain('No credits were charged.');
	});

	it('503 raises "temporarily unavailable", not charged', async () => {
		const { context } = fakeContext({
			params: { operation: 'keywordIdeas', seed: 's' },
			respond: () =>
				failure(
					503,
					{ error: { message: 'This tool is temporarily unavailable. You were not charged.' } },
					{ 'retry-after': '30', 'x-waggle-credits-used': '0' },
				),
		});
		const error = (await run(context).catch((caught: unknown) => caught)) as NodeApiError;
		expect(error.message).toBe('Vera is temporarily unavailable');
		expect(error.description).toContain('Try again in 30 seconds.');
		expect(error.description).toContain('No credits were charged.');
	});

	it('422 raises "Invalid input" with the API message', async () => {
		const { context } = fakeContext({
			params: { operation: 'geoQueryRadar', query: 'q' },
			respond: () =>
				failure(
					422,
					{
						error: {
							code: 'invalid_request',
							message: 'depth: Input should be less than or equal to 100',
						},
					},
					{ 'x-waggle-credits-used': '0' },
				),
		});
		const error = (await run(context).catch((caught: unknown) => caught)) as NodeApiError;
		expect(error.message).toBe('Invalid input');
		expect(error.httpCode).toBe('422');
		expect(error.description).toContain('depth: Input should be less than or equal to 100');
	});

	it('402 raises "Not enough Vera credits" with the pricing link', async () => {
		const { context } = fakeContext({
			params: { operation: 'aiAnswers', prompt: 'p', brand: 'b', engines: ['claude'] },
			respond: () =>
				failure(
					402,
					{ error: { message: 'This request requires 500 credits.' } },
					{ 'x-waggle-credits-used': '0' },
				),
		});
		const error = (await run(context).catch((caught: unknown) => caught)) as NodeApiError;
		expect(error.message).toBe('Not enough Vera credits');
		expect(error.description).toContain('https://vera.waggle.ae/pricing');
	});

	it('an AI answers call with no assistant chosen sends nothing, so it cannot ask them all', async () => {
		const { context, request } = fakeContext({
			params: { operation: 'aiAnswers', prompt: 'p', brand: 'b', engines: [] },
			respond: () => ok({}),
		});
		const error = await run(context).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(NodeOperationError);
		expect(request).not.toHaveBeenCalled();
	});
});
