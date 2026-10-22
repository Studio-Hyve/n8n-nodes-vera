import { describe, expect, it } from 'vitest';

import {
	apiErrorToJson,
	errorToJson,
	mapApiError,
	parseSuccess,
	VeraApiError,
	VeraInputError,
} from '../nodes/Vera/GenericFunctions';
import { failure, ok } from './helpers';

describe('parseSuccess', () => {
	it('returns the API JSON unchanged, with credits_used', () => {
		const body = {
			request_id: 'req_1',
			data: { markdown: '# Hi' },
			credits_used: 1,
			elapsed_ms: 420,
		};
		expect(parseSuccess(ok(body))).toEqual(body);
	});

	it('takes credits_used from the X-Waggle-Credits-Used header, the charge for this call', () => {
		expect(
			parseSuccess(ok({ data: {}, credits_used: 5 }, { 'x-waggle-credits-used': '5' })),
		).toMatchObject({ credits_used: 5 });
	});

	it('shows 0 credits on an idempotent replay even though the stored body shows the first charge', () => {
		const result = parseSuccess(
			ok(
				{ data: { markdown: 'x' }, credits_used: 1, request_id: 'req_1' },
				{ 'x-waggle-credits-used': '0', 'x-waggle-idempotency-replayed': 'true' },
			),
		);
		expect(result).toMatchObject({
			credits_used: 0,
			request_id: 'req_1',
			idempotency_replayed: true,
		});
	});

	it('uses the body credits_used when there is no header', () => {
		expect(
			parseSuccess({ body: { data: {}, credits_used: 3 }, headers: {}, statusCode: 200 }),
		).toMatchObject({ credits_used: 3 });
	});

	it('falls back to the X-Waggle-Credits-Used header and request id header', () => {
		const result = parseSuccess(
			ok(
				{ data: { results: [] } },
				{ 'x-waggle-credits-used': '3', 'x-waggle-request-id': 'req_9' },
			),
		);
		expect(result).toEqual({ data: { results: [] }, credits_used: 3, request_id: 'req_9' });
	});

	it('reports 0 credits when neither body nor header says', () => {
		expect(parseSuccess({ body: { data: {} }, headers: {}, statusCode: 200 })).toMatchObject({
			credits_used: 0,
		});
	});

	it('parses a JSON string body', () => {
		expect(parseSuccess(ok('{"data":{"a":1},"credits_used":1}'))).toMatchObject({ data: { a: 1 } });
	});

	it.each([['not json'], [null], [[1, 2]], [42]])('refuses a non-object body %j', (body) => {
		expect(() => parseSuccess(ok(body))).toThrow(VeraApiError);
	});
});

describe('mapApiError', () => {
	const message = (text: string, code?: string) => ({
		error: { message: text, ...(code ? { code } : {}) },
	});

	it('401: invalid key', () => {
		const info = mapApiError(
			failure(401, message('API key is invalid, expired or revoked.', 'fetch_failed'), {
				'x-waggle-credits-used': '0',
			}),
		);
		expect(info.message).toBe('Vera rejected the API key');
		expect(info.description).toContain('API key is invalid, expired or revoked.');
		expect(info.description).toContain('Vera API credential');
		expect(info.description).toContain('No credits were charged.');
		// The API labels a 401 "fetch_failed"; that code would mislead, so it is not surfaced.
		expect(info.code).toBeUndefined();
		expect(info.httpCode).toBe(401);
	});

	it('402: out of credits', () => {
		const info = mapApiError(failure(402, message('This request requires 3 credits.')));
		expect(info.message).toBe('Not enough Vera credits');
		expect(info.description).toContain('This request requires 3 credits.');
		expect(info.description).toContain('https://vera.waggle.ae/pricing');
	});

	it('403: account action needed', () => {
		const info = mapApiError(
			failure(403, message('Confirm your email address before collecting pages.')),
		);
		expect(info.message).toBe('Vera refused the request');
		expect(info.description).toContain('Confirm your email address');
	});

	it.each([409, 410])('%s: idempotency problems', (status) => {
		expect(
			mapApiError(failure(status, message('Idempotency-Key was already used.'))).description,
		).toContain('idempotency key');
	});

	it('422: carries the machine code of a failed fetch', () => {
		const info = mapApiError(
			failure(422, message('This page is disallowed by robots.txt.', 'robots_disallowed'), {
				'x-waggle-credits-used': '0',
				'x-waggle-request-id': 'req_42',
			}),
		);
		expect(info.message).toBe('Invalid input');
		expect(info.description).toContain('This page is disallowed by robots.txt.');
		expect(info.code).toBe('robots_disallowed');
		expect(info.requestId).toBe('req_42');
		expect(info.creditsUsed).toBe(0);
	});

	it('402: out of credits, with the pricing link, for the search tools too', () => {
		const info = mapApiError(
			failure(402, message('This request requires 200 credits.'), { 'x-waggle-credits-used': '0' }),
		);
		expect(info.message).toBe('Not enough Vera credits');
		expect(info.description).toContain('This request requires 200 credits.');
		expect(info.description).toContain(
			'Add credits or choose a plan at https://vera.waggle.ae/pricing.',
		);
		expect(info.description).toContain('No credits were charged.');
	});

	it('400: a request the tool could not price is invalid input, with the message', () => {
		const info = mapApiError(
			failure(400, message('depth: Input should be less than or equal to 100')),
		);
		expect(info.message).toBe('Invalid input');
		expect(info.description).toContain('depth: Input should be less than or equal to 100');
	});

	it('422: validation messages without a code', () => {
		const info = mapApiError(failure(422, message('Check these fields: selector')));
		expect(info.description).toContain('Check these fields: selector');
		expect(info.code).toBeUndefined();
	});

	it('429: includes the Retry-After wait', () => {
		const info = mapApiError(
			failure(429, message('Too many requests. Please try again shortly.'), {
				'retry-after': '60',
			}),
		);
		expect(info.message).toBe('Vera rate limit reached');
		expect(info.retryAfterSeconds).toBe(60);
		expect(info.description).toContain('Try again in 60 seconds.');
	});

	it('429: the free-trial daily limit arrives as an object body', () => {
		const info = mapApiError(
			failure(
				429,
				{
					error: {
						code: 'trial_daily_limit',
						message: 'Daily free limit reached.',
						retry_after_seconds: 3600,
					},
				},
				{ 'retry-after': '3600' },
			),
		);
		expect(info.description).toContain('Daily free limit reached.');
		expect(info.retryAfterSeconds).toBe(3600);
	});

	it('429 without Retry-After', () => {
		expect(mapApiError(failure(429, message('slow down'))).description).toContain(
			'Wait a moment and try again.',
		);
	});

	it.each([502, 503])('%s: temporarily unavailable, with the search code', (status) => {
		const info = mapApiError(
			failure(
				status,
				message('Search is temporarily unavailable. No credits were charged.', 'fetch_failed'),
			),
		);
		expect(info.message).toBe('Vera is temporarily unavailable');
		if (status === 502) expect(info.code).toBe('fetch_failed');
	});

	it('503: temporarily unavailable and not charged, with the wait to retry', () => {
		const info = mapApiError(
			failure(
				503,
				message(
					'This tool is temporarily unavailable. You were not charged. Please try again in a moment.',
				),
				{ 'retry-after': '30', 'x-waggle-credits-used': '0' },
			),
		);
		expect(info.message).toBe('Vera is temporarily unavailable');
		expect(info.description).toContain('Try again in 30 seconds.');
		expect(info.description).toContain('No credits were charged.');
		expect(info.retryAfterSeconds).toBe(30);
	});

	it('503 and 504 are documented as not charged even when no header says so', () => {
		expect(mapApiError(failure(503, message('x'))).description).toContain(
			'No credits were charged.',
		);
		expect(mapApiError(failure(504, message('x'))).description).toContain(
			'No credits were charged.',
		);
	});

	it('503 and 504 do not claim "not charged" when the header shows a charge', () => {
		for (const status of [503, 504]) {
			expect(
				mapApiError(failure(status, message('x'), { 'x-waggle-credits-used': '3' })).description,
			).not.toContain('No credits were charged.');
		}
	});

	it('504: a timeout, not charged, with advice to ask for less', () => {
		const info = mapApiError(
			failure(
				504,
				message('The service behind this tool took too long to answer. You were not charged.'),
				{ 'x-waggle-credits-used': '0' },
			),
		);
		expect(info.message).toBe('Vera timed out');
		expect(info.description).toContain('took too long');
		expect(info.description).toContain('a smaller Depth, fewer Samples or one assistant');
		expect(info.description).toContain('No credits were charged.');
		expect(info.httpCode).toBe(504);
	});

	it('500: internal error', () => {
		expect(mapApiError(failure(500, message('An unexpected error occurred.'))).message).toBe(
			'Vera had an internal error',
		);
	});

	it('other statuses name the status', () => {
		expect(mapApiError(failure(418, null)).message).toBe('Vera returned HTTP 418');
	});

	it('copes with an HTML or string body', () => {
		const info = mapApiError(failure(502, '<html>Bad gateway</html>'));
		expect(info.message).toBe('Vera is temporarily unavailable');
		expect(info.description).not.toContain('Vera said');
	});

	it('reads a JSON string body', () => {
		expect(mapApiError(failure(402, '{"error":{"message":"Out."}}')).description).toContain('Out.');
	});

	it('does not claim "no credits charged" unless the header says 0', () => {
		expect(
			mapApiError(failure(422, message('x'), { 'x-waggle-credits-used': '1' })).description,
		).not.toContain('No credits were charged.');
		expect(mapApiError(failure(422, message('x'))).description).not.toContain(
			'No credits were charged.',
		);
	});
});

describe('error items for Continue on Fail', () => {
	it('keeps the rich API fields', () => {
		const info = mapApiError(
			failure(
				429,
				{ error: { message: 'Too many requests.' } },
				{
					'retry-after': '30',
					'x-waggle-request-id': 'req_7',
					'x-waggle-credits-used': '0',
				},
			),
		);
		expect(apiErrorToJson(info)).toMatchObject({
			error: 'Vera rate limit reached',
			status_code: 429,
			retry_after_seconds: 30,
			request_id: 'req_7',
			credits_used: 0,
		});
	});

	it('handles input errors and unknown errors', () => {
		expect(errorToJson(new VeraInputError('URL is required', 'Enter an address.'))).toEqual({
			error: 'URL is required',
			description: 'Enter an address.',
		});
		expect(errorToJson(new Error('ECONNRESET'))).toEqual({ error: 'ECONNRESET' });
		expect(errorToJson('odd')).toEqual({ error: 'odd' });
	});
});
