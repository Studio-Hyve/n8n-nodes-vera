import { describe, expect, it } from 'vitest';

import {
	buildRequestSpec,
	toHttpOptions,
	VeraInputError,
	type VeraOperation,
} from '../nodes/Vera/GenericFunctions';
import { retryToken, getterFor, type Params } from './helpers';

const build = (operation: VeraOperation, params: Params) =>
	buildRequestSpec(operation, getterFor(params));

const field = (name: string, selector: string, extra: Record<string, unknown> = {}) => ({
	name,
	selector,
	...extra,
});

describe('Scrape Page request', () => {
	it('sends Markdown by default as the API response_format', () => {
		expect(build('scrape', { url: 'https://example.com' })).toEqual({
			path: '/scrape',
			body: { url: 'https://example.com', response_format: 'markdown' },
		});
	});

	it('trims the URL', () => {
		expect(build('scrape', { url: '  https://example.com/a  ' }).body.url).toBe(
			'https://example.com/a',
		);
	});

	it('maps the HTML format to return_html and drops response_format', () => {
		const { body } = build('scrape', { url: 'https://example.com', format: 'html' });
		expect(body).toEqual({ url: 'https://example.com', return_html: true });
	});

	it('maps Render JavaScript to render: true, with wait options', () => {
		const { body } = build('scrape', {
			url: 'https://example.com',
			render: true,
			options: { waitMs: 1500, waitFor: '.results' },
		});
		expect(body).toEqual({
			url: 'https://example.com',
			render: true,
			response_format: 'markdown',
			wait_ms: 1500,
			wait_for: '.results',
		});
	});

	it('does not send render when it is off', () => {
		expect(build('scrape', { url: 'https://example.com', render: false }).body).not.toHaveProperty(
			'render',
		);
	});

	it('builds the extract map from the field list', () => {
		const { body } = build('scrape', {
			url: 'https://example.com',
			fields: {
				field: [
					field('title', 'h1'),
					field('price', '.price', { attribute: 'data-amount' }),
					field('links', 'a.nav', { attribute: 'href', multiple: true }),
					field('description', 'meta[name=description]', { attribute: 'content' }),
				],
			},
		});
		expect(body.extract).toEqual({
			title: { selector: 'h1' },
			price: { selector: '.price', attribute: 'data-amount' },
			links: { selector: 'a.nav', attribute: 'href', multiple: true },
			description: { selector: 'meta[name=description]', attribute: 'content' },
		});
	});

	it('sends no extract key for an empty field list', () => {
		expect(
			build('scrape', { url: 'https://example.com', fields: { field: [] } }).body,
		).not.toHaveProperty('extract');
	});

	it('sends the minimum quality score when set', () => {
		expect(
			build('scrape', { url: 'https://example.com', options: { minQualityScore: 60 } }).body
				.min_quality_score,
		).toBe(60);
	});

	it.each([
		['missing', ''],
		['not http(s)', 'ftp://example.com/file'],
		['no scheme', 'example.com/page'],
		['too long', 'https://example.com/' + 'a'.repeat(2050)],
	])('rejects a %s URL before any request', (_label, url) => {
		expect(() => build('scrape', { url })).toThrow(VeraInputError);
	});

	it('rejects Fields to Extract with Render JavaScript (the API refuses it)', () => {
		expect(() =>
			build('scrape', {
				url: 'https://example.com',
				render: true,
				fields: { field: [field('t', 'h1')] },
			}),
		).toThrow(/cannot be used with Render JavaScript/);
	});

	it('rejects Fields to Extract with the HTML format (the API refuses it)', () => {
		expect(() =>
			build('scrape', {
				url: 'https://example.com',
				format: 'html',
				fields: { field: [field('t', 'h1')] },
			}),
		).toThrow(/HTML format/);
	});

	it('rejects more than 10 fields', () => {
		const many = Array.from({ length: 11 }, (_, index) => field(`f${index}`, 'p'));
		expect(() => build('scrape', { url: 'https://example.com', fields: { field: many } })).toThrow(
			/Too many fields/,
		);
		const ten = many.slice(0, 10);
		expect(
			Object.keys(
				build('scrape', { url: 'https://example.com', fields: { field: ten } }).body
					.extract as object,
			),
		).toHaveLength(10);
	});

	it.each([
		['empty', ''],
		['starts with a digit', '1price'],
		['has a dash', 'my-field'],
		['too long', 'a'.repeat(51)],
	])('rejects a field name that is %s', (_label, name) => {
		expect(() =>
			build('scrape', { url: 'https://example.com', fields: { field: [field(name, 'h1')] } }),
		).toThrow(/Invalid field name/);
	});

	it('rejects a duplicate field name', () => {
		expect(() =>
			build('scrape', {
				url: 'https://example.com',
				fields: { field: [field('a', 'h1'), field('a', 'h2')] },
			}),
		).toThrow(/used twice/);
	});

	it.each(['div p', 'a:hover', 'ul > li', 'h1, h2', '', '.a b', 'p::first-line'])(
		'rejects the unsupported selector %j',
		(selector) => {
			expect(() =>
				build('scrape', {
					url: 'https://example.com',
					fields: { field: [field('x', selector)] },
				}),
			).toThrow(/selector/i);
		},
	);

	it.each([
		'h1',
		'.price',
		'#main',
		'a.nav#top',
		'*',
		'[data-id]',
		'input[type="text"]',
		"meta[name='og:title']",
	])('accepts the supported selector %j', (selector) => {
		expect(
			build('scrape', { url: 'https://example.com', fields: { field: [field('x', selector)] } })
				.body.extract,
		).toEqual({ x: { selector } });
	});

	it('rejects an invalid attribute name', () => {
		expect(() =>
			build('scrape', {
				url: 'https://example.com',
				fields: { field: [field('x', 'a', { attribute: '1bad' })] },
			}),
		).toThrow(/Invalid attribute/);
	});

	it('rejects wait options without Render JavaScript', () => {
		expect(() => build('scrape', { url: 'https://example.com', options: { waitMs: 100 } })).toThrow(
			/need Render JavaScript/,
		);
		expect(() =>
			build('scrape', { url: 'https://example.com', options: { waitFor: '.x' } }),
		).toThrow(/need Render JavaScript/);
	});

	it.each([-1, 3001, 1.5])('rejects Wait (Ms) = %s', (waitMs) => {
		expect(() =>
			build('scrape', { url: 'https://example.com', render: true, options: { waitMs } }),
		).toThrow(/Wait \(Ms\)/);
	});

	it.each([-1, 101, 50.5])('rejects Minimum Quality Score = %s', (minQualityScore) => {
		expect(() =>
			build('scrape', { url: 'https://example.com', options: { minQualityScore } }),
		).toThrow(/Minimum Quality Score/);
	});
});

describe('Extract Contacts and Extract Products requests', () => {
	it('sends only the url for contacts', () => {
		expect(build('extractContacts', { url: 'https://example.com/contact' })).toEqual({
			path: '/contacts',
			body: { url: 'https://example.com/contact' },
		});
	});

	it('sends only the url for products on Auto-Detect', () => {
		expect(
			build('extractProducts', { url: 'https://shop.example.com/p/1', marketplace: 'auto' }),
		).toEqual({ path: '/products', body: { url: 'https://shop.example.com/p/1' } });
	});

	it.each(['amazon', 'walmart', 'shopee'])('sends marketplace %s', (marketplace) => {
		expect(
			build('extractProducts', { url: 'https://www.example.com/p/1', marketplace }).body,
		).toEqual({ url: 'https://www.example.com/p/1', marketplace });
	});

	it('validates the URL for both', () => {
		expect(() => build('extractContacts', { url: 'nope' })).toThrow(VeraInputError);
		expect(() => build('extractProducts', { url: '' })).toThrow(VeraInputError);
	});
});

describe('search requests', () => {
	it.each([
		['webSearch', '/search'],
		['newsSearch', '/search/news'],
		['videoSearch', '/search/videos'],
	] as const)('%s posts to %s', (operation, path) => {
		expect(build(operation, { query: 'vera', limit: 20 })).toEqual({
			path,
			body: { query: 'vera', limit: 20 },
		});
	});

	it('sends country and language only when set', () => {
		expect(
			build('webSearch', { query: 'q', limit: 5, options: { country: 'ae', language: 'ar' } }).body,
		).toEqual({ query: 'q', limit: 5, country: 'ae', language: 'ar' });
	});

	it('keeps quoted phrases and operators exactly as written', () => {
		expect(
			build('webSearch', { query: ' "exact phrase" site:example.com ', limit: 10 }).body.query,
		).toBe('"exact phrase" site:example.com');
	});

	it('defaults the limit to 50', () => {
		expect(build('webSearch', { query: 'q' }).body.limit).toBe(50);
	});

	it.each([0, 101, 2.5, -3])('rejects limit %s', (limit) => {
		expect(() => build('webSearch', { query: 'q', limit })).toThrow(/Limit must be/);
	});

	it('accepts the limits 1 and 100', () => {
		expect(build('webSearch', { query: 'q', limit: 1 }).body.limit).toBe(1);
		expect(build('webSearch', { query: 'q', limit: 100 }).body.limit).toBe(100);
	});

	it('rejects an empty, overlong or control-character query', () => {
		expect(() => build('webSearch', { query: '   ' })).toThrow(/Query is required/);
		expect(() => build('webSearch', { query: 'a'.repeat(501) })).toThrow(/not valid/);
		expect(() => build('webSearch', { query: 'a\u0007b' })).toThrow(/not valid/);
	});

	it.each(['US', 'usa', 'u', '1a'])('rejects country %j', (country) => {
		expect(() => build('webSearch', { query: 'q', options: { country } })).toThrow(/Country/);
	});

	it.each(['EN', 'eng'])('rejects language %j', (language) => {
		expect(() => build('webSearch', { query: 'q', options: { language } })).toThrow(/Language/);
	});
});

describe('idempotency key', () => {
	it('is carried on the spec and sent as a header', () => {
		const spec = build('webSearch', {
			query: 'q',
			options: { idempotencyKey: retryToken('daily-report-2026-01-01-item-0') },
		});
		expect(spec.idempotencyKey).toBe(retryToken('daily-report-2026-01-01-item-0'));
		expect(spec.body).not.toHaveProperty('idempotencyKey');
		expect(toHttpOptions(spec).headers).toMatchObject({
			'Idempotency-Key': retryToken('daily-report-2026-01-01-item-0'),
		});
	});

	it.each(['short', 'has spaces in the key!!', 'a'.repeat(129)])('rejects %j', (key) => {
		expect(() =>
			build('extractContacts', { url: 'https://example.com', options: { idempotencyKey: key } }),
		).toThrow(/Idempotency Key/);
	});

	it('is absent unless set', () => {
		expect(build('extractContacts', { url: 'https://example.com' }).idempotencyKey).toBeUndefined();
		expect(
			toHttpOptions(build('extractContacts', { url: 'https://example.com' })).headers,
		).not.toHaveProperty('Idempotency-Key');
	});
});

describe('toHttpOptions', () => {
	it('targets the production base URL with a full-response JSON POST', () => {
		const options = toHttpOptions(build('scrape', { url: 'https://example.com' }));
		expect(options).toMatchObject({
			method: 'POST',
			url: 'https://vera.waggle.ae/api/vera/v1/scrape',
			json: true,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
			timeout: 60000,
		});
		expect(options.headers).toMatchObject({ Accept: 'application/json' });
	});

	it('never puts credentials in the request itself (auth comes from the credential)', () => {
		const options = toHttpOptions(build('webSearch', { query: 'q', limit: 5 }));
		expect(JSON.stringify(options)).not.toMatch(/bearer|authorization|vera_live/i);
	});

	it('rejects an unknown operation', () => {
		expect(() => build('nope' as VeraOperation, {})).toThrow(/Unknown operation/);
	});
});
