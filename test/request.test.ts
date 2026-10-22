import { describe, expect, it } from 'vitest';

import {
	buildRequestSpec,
	resolveBaseUrl,
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
			url: 'https://vera.waggle.ae/v1/scrape',
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

describe('SERP request (Get Results Page)', () => {
	it('posts the engine in the path, with the query as q and the depth', () => {
		expect(build('serpSearch', { query: ' best coffee in dubai ' })).toEqual({
			path: '/serp/google',
			body: { q: 'best coffee in dubai', depth: 10 },
			timeoutMs: 50_000,
		});
	});

	it.each(['google', 'bing', 'duckduckgo', 'brave', 'yahoo'])('accepts the engine %s', (engine) => {
		expect(build('serpSearch', { query: 'q', engine }).path).toBe(`/serp/${engine}`);
	});

	it.each(['ask', 'Google', '../usage', 'google/../../x', ''])(
		'rejects the engine %j before any request, so nothing odd reaches the URL path',
		(engine) => {
			expect(() => build('serpSearch', { query: 'q', engine })).toThrow(/Unknown search engine/);
		},
	);

	it('maps Country, Language and Location to gl, hl and location, lower-casing the codes', () => {
		const { body } = build('serpSearch', {
			query: 'coffee shop',
			depth: 20,
			options: { country: 'AE', language: 'EN', location: ' Dubai ', fresh: true },
		});
		expect(body).toEqual({
			q: 'coffee shop',
			depth: 20,
			gl: 'ae',
			hl: 'en',
			location: 'Dubai',
			fresh: true,
		});
	});

	it('accepts a regional language code such as pt-br or zh-hans-cn', () => {
		expect(build('serpSearch', { query: 'q', options: { language: 'pt-br' } }).body.hl).toBe(
			'pt-br',
		);
		expect(
			build('aiAnswers', { prompt: 'p', brand: 'b', options: { language: 'zh-hans-cn' } }).body
				.language,
		).toBe('zh-hans-cn');
	});

	it('sends the default features plus each add-on, once, only when an add-on is chosen', () => {
		expect(
			build('serpSearch', { query: 'q', addOns: ['local_pack', 'shopping', 'local_pack'] }).body
				.features,
		).toEqual(['organic', 'paa', 'ai_overview', 'local_pack', 'shopping']);
		expect(build('serpSearch', { query: 'q', addOns: [] }).body).not.toHaveProperty('features');
	});

	it('refuses add-ons on an engine other than Google', () => {
		expect(() => build('serpSearch', { query: 'q', engine: 'bing', addOns: ['shopping'] })).toThrow(
			/Google add-ons/,
		);
	});

	it('rejects an unknown add-on', () => {
		expect(() => build('serpSearch', { query: 'q', addOns: ['maps'] })).toThrow(/Unknown add-on/);
	});

	it.each([0, 101, 2.5, -1])('rejects Depth %s', (depth) => {
		expect(() => build('serpSearch', { query: 'q', depth })).toThrow(/Depth must be/);
	});

	it('accepts the depths 1 and 100', () => {
		expect(build('serpSearch', { query: 'q', depth: 1 }).body.depth).toBe(1);
		expect(build('serpSearch', { query: 'q', depth: 100 }).body.depth).toBe(100);
	});

	it('rejects an empty or overlong query and bad market codes', () => {
		expect(() => build('serpSearch', { query: '  ' })).toThrow(/Query is required/);
		expect(() => build('serpSearch', { query: 'a'.repeat(501) })).toThrow(/Query is not valid/);
		expect(() => build('serpSearch', { query: 'q', options: { country: 'usa' } })).toThrow(
			/Country/,
		);
		expect(() => build('serpSearch', { query: 'q', options: { language: 'e' } })).toThrow(
			/Language/,
		);
	});
});

describe('Keyword ideas request', () => {
	it('sends the seed, the limit and the expansion, always, so the price does not depend on a default', () => {
		expect(build('keywordIdeas', { seed: ' specialty coffee ' })).toEqual({
			path: '/keywords/ideas',
			body: { seed: 'specialty coffee', limit: 50, expand: 'questions' },
			timeoutMs: 80_000,
		});
	});

	it('maps the options', () => {
		expect(
			build('keywordIdeas', {
				seed: 'قهوة مختصة',
				limit: 200,
				expand: 'all',
				options: { country: 'ae', language: 'ar', location: 'Dubai', fresh: true },
			}).body,
		).toEqual({
			seed: 'قهوة مختصة',
			limit: 200,
			expand: 'all',
			gl: 'ae',
			hl: 'ar',
			location: 'Dubai',
			fresh: true,
		});
	});

	it.each(['none', 'questions', 'alphabet', 'all'])('accepts the expansion %s', (expand) => {
		expect(build('keywordIdeas', { seed: 's', expand }).body.expand).toBe(expand);
	});

	it('rejects a missing seed, an unknown expansion and an out-of-range limit', () => {
		expect(() => build('keywordIdeas', { seed: '' })).toThrow(/Seed is required/);
		expect(() => build('keywordIdeas', { seed: 's', expand: 'everything' })).toThrow(
			/Unknown expansion/,
		);
		for (const limit of [0, 201, 1.5]) {
			expect(() => build('keywordIdeas', { seed: 's', limit })).toThrow(/Limit must be/);
		}
	});
});

describe('AI answers request', () => {
	const base = { prompt: 'What are the best coffee roasters in Dubai?', brand: 'Roasters' };

	it('asks one assistant once unless told otherwise, never leaving the engines out', () => {
		expect(build('aiAnswers', base)).toEqual({
			path: '/ai/answers',
			body: { ...base, engines: ['chatgpt'], samples: 1 },
			timeoutMs: 175_000,
		});
	});

	it('maps every field', () => {
		const { body } = build('aiAnswers', {
			...base,
			brandDomain: ' roasters.ae ',
			competitors: 'Other Roasters, rivals.ae,\nother roasters, ',
			engines: ['chatgpt', 'Claude', 'gemini', 'claude'],
			samples: 3,
			options: { country: 'AE', language: 'ar', city: 'Dubai' },
		});
		expect(body).toEqual({
			...base,
			brand_domain: 'roasters.ae',
			competitors: ['Other Roasters', 'rivals.ae'],
			engines: ['chatgpt', 'claude', 'gemini'],
			samples: 3,
			country: 'ae',
			language: 'ar',
			city: 'Dubai',
		});
	});

	it('refuses an empty engine list, which the API would read as "every assistant"', () => {
		expect(() => build('aiAnswers', { ...base, engines: [] })).toThrow(
			/Choose at least one AI assistant/,
		);
	});

	it('refuses an unknown assistant, and accepts Perplexity as the API names it', () => {
		expect(() => build('aiAnswers', { ...base, engines: ['bard'] })).toThrow(
			/Unknown AI assistant/,
		);
		expect(build('aiAnswers', { ...base, engines: ['perplexity'] }).body.engines).toEqual([
			'perplexity',
		]);
	});

	it.each([0, 6, 1.5])('rejects Samples = %s', (samples) => {
		expect(() => build('aiAnswers', { ...base, samples })).toThrow(/Samples must be/);
	});

	it('requires the question and the brand, within their limits', () => {
		expect(() => build('aiAnswers', { brand: 'B' })).toThrow(/Question is required/);
		expect(() => build('aiAnswers', { prompt: 'p' })).toThrow(/Brand is required/);
		expect(() => build('aiAnswers', { ...base, prompt: 'a'.repeat(1001) })).toThrow(
			/Question is not valid/,
		);
		expect(() => build('aiAnswers', { ...base, brand: 'b'.repeat(201) })).toThrow(
			/Brand is not valid/,
		);
	});

	it('limits the competitors to 20 names of 200 characters', () => {
		const twentyOne = Array.from({ length: 21 }, (_, index) => `rival ${index}`).join(',');
		expect(() => build('aiAnswers', { ...base, competitors: twentyOne })).toThrow(
			/competitor names/,
		);
		expect(() => build('aiAnswers', { ...base, competitors: 'c'.repeat(201) })).toThrow(
			/competitor names/,
		);
		const twenty = Array.from({ length: 20 }, (_, index) => `rival ${index}`).join(',');
		expect(build('aiAnswers', { ...base, competitors: twenty }).body.competitors).toHaveLength(20);
	});

	it('omits the optional fields when they are empty', () => {
		const { body } = build('aiAnswers', { ...base, brandDomain: '', competitors: '', options: {} });
		expect(body).not.toHaveProperty('brand_domain');
		expect(body).not.toHaveProperty('competitors');
		expect(body).not.toHaveProperty('city');
	});
});

describe('GEO query radar request', () => {
	it('sends the query and the depth, with the brand and domain when given', () => {
		expect(
			build('geoQueryRadar', {
				query: 'best specialty coffee roasters in dubai',
				brand: 'Roasters',
				domain: 'roasters.ae',
				depth: 30,
				options: { location: 'Dubai', country: 'ae', language: 'en', fresh: true },
			}),
		).toEqual({
			path: '/geo/radar/query',
			body: {
				query: 'best specialty coffee roasters in dubai',
				brand: 'Roasters',
				domain: 'roasters.ae',
				depth: 30,
				location: 'Dubai',
				gl: 'ae',
				hl: 'en',
				fresh: true,
			},
			timeoutMs: 80_000,
		});
	});

	it('defaults to depth 30 and leaves the brand out when empty', () => {
		expect(build('geoQueryRadar', { query: 'q' }).body).toEqual({ query: 'q', depth: 30 });
	});

	it('rejects a missing query and a depth outside 1 to 100', () => {
		expect(() => build('geoQueryRadar', { query: '' })).toThrow(/Query is required/);
		for (const depth of [0, 101]) {
			expect(() => build('geoQueryRadar', { query: 'q', depth })).toThrow(/Depth must be/);
		}
	});
});

describe('Company footprint request', () => {
	it('sends the company, the domain and the depth', () => {
		expect(
			build('companyFootprint', {
				company: ' Roasters ',
				domain: 'roasters.ae',
				options: { location: 'Dubai', country: 'ae', language: 'en' },
			}),
		).toEqual({
			path: '/company/footprint',
			body: {
				company: 'Roasters',
				domain: 'roasters.ae',
				depth: 20,
				location: 'Dubai',
				gl: 'ae',
				hl: 'en',
			},
			timeoutMs: 65_000,
		});
	});

	it('rejects a missing company and a depth outside 1 to 100', () => {
		expect(() => build('companyFootprint', { company: ' ' })).toThrow(/Company is required/);
		expect(() => build('companyFootprint', { company: 'c', depth: 101 })).toThrow(/Depth must be/);
	});
});

describe('timeouts', () => {
	it('gives the long-running search tools time to finish, AI answers the longest', () => {
		const timeout = (operation: VeraOperation, params: Params) =>
			toHttpOptions(build(operation, params)).timeout;
		expect(timeout('serpSearch', { query: 'q' })).toBe(50_000);
		expect(timeout('keywordIdeas', { seed: 's' })).toBe(80_000);
		expect(timeout('geoQueryRadar', { query: 'q' })).toBe(80_000);
		expect(timeout('companyFootprint', { company: 'c' })).toBe(65_000);
		// The API takes up to 150 s for AI answers, after a few seconds to price the call.
		expect(timeout('aiAnswers', { prompt: 'p', brand: 'b' })).toBe(175_000);
		expect(timeout('aiAnswers', { prompt: 'p', brand: 'b' })).toBeGreaterThan(150_000);
	});

	it('leaves page and search calls on the 60 second default', () => {
		expect(toHttpOptions(build('webSearch', { query: 'q' })).timeout).toBe(60_000);
		expect(toHttpOptions(build('scrape', { url: 'https://example.com' })).timeout).toBe(60_000);
	});
});

describe('idempotency key on the search tools', () => {
	it('is sent as a header, not in the body', () => {
		const spec = build('aiAnswers', {
			prompt: 'p',
			brand: 'b',
			options: { idempotencyKey: retryToken('report-2026-01-01-answer-0001') },
		});
		expect(spec.body).not.toHaveProperty('idempotencyKey');
		expect(toHttpOptions(spec).headers).toMatchObject({
			'Idempotency-Key': retryToken('report-2026-01-01-answer-0001'),
		});
	});
});

describe('resolveBaseUrl', () => {
	it('is the production API when the credential has none', () => {
		expect(resolveBaseUrl(undefined)).toBe('https://vera.waggle.ae/v1');
		expect(resolveBaseUrl('   ')).toBe('https://vera.waggle.ae/v1');
	});

	it('keeps a configured https address, without a trailing slash', () => {
		expect(resolveBaseUrl(' https://staging.vera.example/v1/ ')).toBe(
			'https://staging.vera.example/v1',
		);
	});

	it('lets requests go to the configured address', () => {
		const options = toHttpOptions(
			build('serpSearch', { query: 'q' }),
			resolveBaseUrl('https://staging.vera.example/v1'),
		);
		expect(options.url).toBe('https://staging.vera.example/v1/serp/google');
	});

	it('accepts plain http only for a local development server', () => {
		expect(resolveBaseUrl('http://localhost:8000/v1')).toBe('http://localhost:8000/v1');
		expect(resolveBaseUrl('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000');
		expect(() => resolveBaseUrl('http://vera.example/v1')).toThrow(/must use https/);
	});

	it.each(['not a url', 'ftp://vera.example', '//vera.example/v1'])('rejects %j', (value) => {
		expect(() => resolveBaseUrl(value)).toThrow(VeraInputError);
	});
});
