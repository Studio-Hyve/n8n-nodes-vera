import { describe, expect, it } from 'vitest';

import { buildRequestSpec, type VeraOperation } from '../nodes/Vera/GenericFunctions';
import snapshot from './fixtures/openapi-request-schemas.json';
import { getterFor, type Params } from './helpers';

// The request schemas Vera publishes at /v1/openapi.json (snapshot in test/fixtures).
// Every body this package builds for page and search calls must fit them: only known keys, required
// keys present, enum values and numeric bounds respected. The API rejects unknown fields
// (additionalProperties: false). The search tools (results page, keyword ideas, AI answers, query
// radar, company footprint) take any JSON object, so for those the snapshot holds the documented
// example bodies and the field names the service accepts.
interface SchemaProperty {
	type?: string;
	enum?: unknown[];
	minimum?: number;
	maximum?: number;
	anyOf?: SchemaProperty[];
}
interface RequestSchema {
	properties: Record<string, SchemaProperty>;
	required?: string[];
	additionalProperties: boolean;
}
interface ToolRoute {
	method: string;
	examples: Record<string, Record<string, unknown>>;
	knownFields: string[];
}
const spec = snapshot as unknown as {
	paths: Record<string, { schema: string }>;
	schemas: Record<string, RequestSchema>;
	tools: Record<string, ToolRoute>;
};

function variants(property: SchemaProperty): SchemaProperty[] {
	return property.anyOf ?? [property];
}

function conforms(path: string, body: Record<string, unknown>) {
	const schema = spec.schemas[spec.paths[`/v1${path}`].schema];
	expect(schema.additionalProperties).toBe(false);
	for (const required of schema.required ?? []) expect(body).toHaveProperty(required);
	for (const [key, value] of Object.entries(body)) {
		const property = schema.properties[key];
		expect(property, `${key} is not a field of ${path}`).toBeDefined();
		const allowed = variants(property);
		const matches = allowed.some((candidate) => {
			if (candidate.enum) return candidate.enum.includes(value);
			if (candidate.type === 'integer') {
				return (
					Number.isInteger(value) &&
					(candidate.minimum === undefined || (value as number) >= candidate.minimum) &&
					(candidate.maximum === undefined || (value as number) <= candidate.maximum)
				);
			}
			if (candidate.type === 'boolean') return typeof value === 'boolean';
			if (candidate.type === 'string') return typeof value === 'string';
			if (candidate.type === 'object') return typeof value === 'object' && value !== null;
			return false;
		});
		expect(
			matches,
			`${key}=${JSON.stringify(value)} does not fit ${JSON.stringify(property)}`,
		).toBe(true);
	}
}

const cases: Array<[VeraOperation, Params]> = [
	['scrape', { url: 'https://example.com' }],
	['scrape', { url: 'https://example.com', format: 'html', render: true }],
	[
		'scrape',
		{
			url: 'https://example.com',
			render: true,
			options: { waitMs: 3000, waitFor: '.x', minQualityScore: 100 },
		},
	],
	[
		'scrape',
		{
			url: 'https://example.com',
			fields: { field: [{ name: 'a', selector: 'h1', attribute: 'href', multiple: true }] },
		},
	],
	['extractContacts', { url: 'https://example.com' }],
	['extractProducts', { url: 'https://www.amazon.com/dp/B000000000', marketplace: 'amazon' }],
	['extractProducts', { url: 'https://store.example.com/p/1' }],
	['webSearch', { query: 'q', limit: 100, options: { country: 'ae', language: 'ar' } }],
	['newsSearch', { query: 'q', limit: 1 }],
	['videoSearch', { query: 'q' }],
];

describe('request bodies fit the published OpenAPI request schemas', () => {
	it.each(cases)('%s %j', (operation, params) => {
		const built = buildRequestSpec(operation, getterFor(params));
		conforms(built.path, built.body);
		if (built.body.extract) {
			const rule = spec.schemas.ExtractionRule;
			for (const entry of Object.values(built.body.extract as Record<string, object>)) {
				for (const key of Object.keys(entry)) expect(rule.properties).toHaveProperty(key);
			}
		}
	});

	it('the snapshot still lists every endpoint this package calls', () => {
		for (const path of [
			'/scrape',
			'/search',
			'/search/news',
			'/search/videos',
			'/contacts',
			'/products',
		]) {
			expect(spec.paths).toHaveProperty(`/v1${path}`);
		}
	});
});

describe('the search tools fit the published routes', () => {
	it('the snapshot lists every route this package calls', () => {
		for (const route of [
			'/v1/serp/{engine}',
			'/v1/keywords/ideas',
			'/v1/ai/answers',
			'/v1/geo/radar/query',
			'/v1/company/footprint',
		]) {
			expect(spec.tools).toHaveProperty(route);
			expect(spec.tools[route].method).toBe('post');
		}
	});

	// Each documented example, rebuilt from the node parameters that mean the same thing.
	const examples: Array<[string, string, VeraOperation, Params, string]> = [
		[
			'/v1/serp/{engine}',
			'search',
			'serpSearch',
			{ query: 'best coffee in dubai', depth: 10, options: { country: 'ae', language: 'en' } },
			'/serp/google',
		],
		[
			'/v1/serp/{engine}',
			'with_local_pack',
			'serpSearch',
			{
				query: 'coffee shop',
				depth: 10,
				addOns: ['local_pack'],
				options: { location: 'Dubai', country: 'ae', language: 'en' },
			},
			'/serp/google',
		],
		[
			'/v1/keywords/ideas',
			'ideas',
			'keywordIdeas',
			{
				seed: 'specialty coffee',
				limit: 50,
				expand: 'questions',
				options: { country: 'ae', language: 'en' },
			},
			'/keywords/ideas',
		],
		[
			'/v1/ai/answers',
			'answer',
			'aiAnswers',
			{
				prompt: 'What are the best specialty coffee roasters in Dubai?',
				brand: 'Roasters',
				brandDomain: 'roasters.ae',
				competitors: 'Other Roasters',
				engines: ['chatgpt'],
				samples: 1,
				options: { country: 'ae', language: 'en' },
			},
			'/ai/answers',
		],
		[
			'/v1/geo/radar/query',
			'radar',
			'geoQueryRadar',
			{
				query: 'best specialty coffee roasters in dubai',
				brand: 'Roasters',
				domain: 'roasters.ae',
				depth: 30,
				options: { location: 'Dubai', country: 'ae', language: 'en' },
			},
			'/geo/radar/query',
		],
		[
			'/v1/company/footprint',
			'footprint',
			'companyFootprint',
			{
				company: 'Roasters',
				domain: 'roasters.ae',
				depth: 20,
				options: { location: 'Dubai', country: 'ae', language: 'en' },
			},
			'/company/footprint',
		],
	];

	it.each(examples)(
		'%s example "%s" is what the node sends',
		(route, name, operation, params, path) => {
			const built = buildRequestSpec(operation, getterFor(params));
			expect(built.path).toBe(path);
			expect(built.body).toEqual(spec.tools[route].examples[name]);
		},
	);

	it('sends only field names the services accept, with every option set', () => {
		const everything: Array<[string, VeraOperation, Params]> = [
			[
				'/v1/serp/{engine}',
				'serpSearch',
				{
					query: 'q',
					depth: 100,
					addOns: ['local_pack', 'shopping'],
					options: { country: 'us', language: 'en', location: 'Austin, Texas', fresh: true },
				},
			],
			[
				'/v1/keywords/ideas',
				'keywordIdeas',
				{
					seed: 's',
					limit: 200,
					expand: 'all',
					options: { country: 'ae', language: 'ar', location: 'Dubai', fresh: true },
				},
			],
			[
				'/v1/ai/answers',
				'aiAnswers',
				{
					prompt: 'p',
					brand: 'b',
					brandDomain: 'b.com',
					competitors: 'c1, c2',
					engines: ['chatgpt', 'claude', 'gemini'],
					samples: 5,
					options: { country: 'ae', language: 'en', city: 'Dubai' },
				},
			],
			[
				'/v1/geo/radar/query',
				'geoQueryRadar',
				{
					query: 'q',
					brand: 'b',
					domain: 'b.com',
					depth: 100,
					options: { country: 'ae', language: 'en', location: 'Dubai', fresh: true },
				},
			],
			[
				'/v1/company/footprint',
				'companyFootprint',
				{
					company: 'c',
					domain: 'c.com',
					depth: 100,
					options: { country: 'ae', language: 'en', location: 'Dubai', fresh: true },
				},
			],
		];
		for (const [route, operation, params] of everything) {
			const { body } = buildRequestSpec(operation, getterFor(params));
			for (const key of Object.keys(body)) {
				expect(spec.tools[route].knownFields, `${key} is not a field of ${route}`).toContain(key);
			}
		}
	});
});
