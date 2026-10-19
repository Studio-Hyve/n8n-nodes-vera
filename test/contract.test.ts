import { describe, expect, it } from 'vitest';

import { buildRequestSpec, type VeraOperation } from '../nodes/Vera/GenericFunctions';
import snapshot from './fixtures/openapi-request-schemas.json';
import { getterFor, type Params } from './helpers';

// The request schemas Vera publishes at /api/vera/v1/openapi.json (snapshot in test/fixtures).
// Every body this package builds must fit them: only known keys, required keys present, enum
// values and numeric bounds respected. The API rejects unknown fields (additionalProperties: false).
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
const spec = snapshot as unknown as {
	paths: Record<string, { schema: string }>;
	schemas: Record<string, RequestSchema>;
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
