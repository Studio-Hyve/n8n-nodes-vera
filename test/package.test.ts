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

	it('points at the Studio-Hyve repository, which npm provenance checks against the workflow', () => {
		expect(pkg.repository.url).toBe('git+https://github.com/Studio-Hyve/n8n-nodes-vera.git');
		expect(pkg.bugs.url).toBe('https://github.com/Studio-Hyve/n8n-nodes-vera/issues');
		expect(JSON.stringify(pkg)).not.toContain('OWNER');
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

	it('tests the key against GET /usage, which costs no credits, at the configured Base URL', () => {
		expect(credential.test.request).toEqual({
			baseURL: '={{$credentials.baseUrl}}',
			url: '/usage',
			method: 'GET',
		});
	});

	it('has a Base URL field that defaults to the direct API, not the website proxy', () => {
		const baseUrl = credential.properties.find((property) => property.name === 'baseUrl');
		expect(baseUrl).toMatchObject({ type: 'string', default: 'https://vera.waggle.ae/v1' });
		expect(baseUrl?.typeOptions).toBeUndefined();
		expect(JSON.stringify(credential.properties)).not.toMatch(/api\/vera/);
	});

	it('does not promise a number of free credits that may change', () => {
		expect(JSON.stringify(credential.properties)).not.toMatch(/\d,\d{3}/);
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

	it('offers the eleven operations, each with its cost in the description', () => {
		expect(options.map((option) => option.name).sort()).toEqual([
			'Check Brand in AI Answers',
			'Extract Contacts',
			'Extract Products',
			'Get Ideas',
			'Get Results Page',
			'Get Search Footprint',
			'News Search',
			'Run Query Radar',
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
		for (const value of [
			'serpSearch',
			'keywordIdeas',
			'aiAnswers',
			'geoQueryRadar',
			'companyFootprint',
		]) {
			expect(cost[value]).toMatch(/Priced by what comes back/);
			expect(cost[value]).toMatch(/A failed call is not charged/);
		}
		for (const option of options) expect(option.action).toBeTruthy();
	});

	it('lists one resource per area, each with its own operation', () => {
		const resource = description.properties.find((property) => property.name === 'resource');
		const values = ((resource?.options ?? []) as Array<{ value: string }>).map(
			(option) => option.value,
		);
		expect(values).toEqual([
			'aiAnswers',
			'company',
			'geoRadar',
			'keyword',
			'page',
			'search',
			'serp',
		]);
		for (const value of values) {
			const shown = operations.filter((property) =>
				(property.displayOptions?.show?.resource as string[] | undefined)?.includes(value),
			);
			expect(shown, `operation list of ${value}`).toHaveLength(1);
		}
	});

	it('offers ChatGPT, Claude and Gemini, with ChatGPT alone chosen so that nothing expensive runs by default', () => {
		const engines = description.properties.find((property) => property.name === 'engines');
		expect(engines?.default).toEqual(['chatgpt']);
		expect(
			((engines?.options ?? []) as Array<{ value: string }>).map((option) => option.value),
		).toEqual(['chatgpt', 'claude', 'gemini']);
	});

	it('defaults Samples to one', () => {
		const samples = description.properties.find((property) => property.name === 'samples');
		expect(samples?.default).toBe(1);
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
