import { describe, expect, it } from 'vitest';

import { VeraApi } from '../credentials/VeraApi.credentials';
import { Vera } from '../nodes/Vera/Vera.node';
import pkg from '../package.json';

describe('package.json', () => {
	it('meets the community-node requirements', () => {
		expect(pkg.name).toMatch(/^n8n-nodes-/);
		expect(pkg.keywords).toContain('n8n-community-node-package');
		expect(pkg.license).toBe('MIT');
		expect(pkg.n8n.n8nNodesApiVersion).toBe(1);
		expect(pkg.files).toEqual(['dist']);
	});

	it('has no runtime dependencies (verified nodes may not use any)', () => {
		expect(Object.keys(pkg)).not.toContain('dependencies');
		expect(pkg.peerDependencies).toEqual({ 'n8n-workflow': '*' });
	});

	it('registers the node and the credential', () => {
		expect(pkg.n8n.nodes).toEqual(['dist/nodes/Vera/Vera.node.js']);
		expect(pkg.n8n.credentials).toEqual(['dist/credentials/VeraApi.credentials.js']);
	});

	it('names the author contact and a public homepage', () => {
		expect(pkg.author.email).toBe('contact@waggle.ae');
		expect(pkg.homepage).toBe('https://vera.waggle.ae/docs');
	});
});

describe('Vera API credential', () => {
	const credential = new VeraApi();

	it('is a bearer key kept as a password field', () => {
		expect(credential.name).toBe('veraApi');
		expect(credential.displayName).toBe('Vera API');
		const key = credential.properties.find((property) => property.name === 'apiKey');
		expect(key).toMatchObject({ required: true, typeOptions: { password: true } });
		expect(credential.authenticate).toEqual({
			type: 'generic',
			properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
		});
	});

	it('tests the key against GET /usage, which costs no credits', () => {
		expect(credential.test.request).toEqual({
			baseURL: 'https://vera.waggle.ae/api/vera/v1',
			url: '/usage',
			method: 'GET',
		});
	});
});

describe('Vera node description', () => {
	const { description } = new Vera();
	const operations = description.properties.filter((property) => property.name === 'operation');
	const options = operations.flatMap(
		(property) =>
			(property.options ?? []) as Array<{
				name: string;
				value: string;
				description: string;
				action: string;
			}>,
	);

	it('offers the six operations, each with its credit cost in the description', () => {
		expect(options.map((option) => option.name).sort()).toEqual([
			'Extract Contacts',
			'Extract Products',
			'News Search',
			'Scrape Page',
			'Video Search',
			'Web Search',
		]);
		const cost = Object.fromEntries(options.map((option) => [option.value, option.description]));
		expect(cost.scrape).toMatch(/1 credit, or 5 with Render JavaScript/);
		expect(cost.extractContacts).toMatch(/Costs 1 credit/);
		expect(cost.extractProducts).toMatch(/Costs 1 credit/);
		expect(cost.webSearch).toMatch(/Costs 3 credits/);
		expect(cost.newsSearch).toMatch(/Costs 3 credits/);
		expect(cost.videoSearch).toMatch(/Costs 3 credits/);
		for (const option of options) expect(option.action).toBeTruthy();
	});

	it('requires the Vera API credential and can be used as an AI tool', () => {
		expect(description.credentials).toEqual([{ name: 'veraApi', required: true }]);
		expect(description.usableAsTool).toBe(true);
		expect(description.name).toBe('vera');
	});

	it('states the cost of rendering on the Render JavaScript field', () => {
		const render = description.properties.find((property) => property.name === 'render');
		expect(render?.description).toMatch(/5 credits instead of 1/);
	});
});
