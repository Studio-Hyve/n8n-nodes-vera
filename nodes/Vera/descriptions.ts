import type { INodeProperties } from 'n8n-workflow';

import { MAX_EXTRACT_FIELDS, SEARCH_MAX_RESULTS } from './constants';

const idempotencyKey: INodeProperties = {
	displayName: 'Idempotency Key',
	name: 'idempotencyKey',
	type: 'string',
	default: '',
	placeholder: 'daily-report-2026-01-01-item-0',
	description:
		'Protects a retried call from being charged twice. Repeating the same key and request within 24 hours returns the first result at no cost. 16 to 128 letters, digits, underscores, dots, colons or hyphens.',
};

export const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{ name: 'Page', value: 'page', description: 'Read a public web page' },
		{ name: 'Search', value: 'search', description: 'Search the web, news or videos' },
	],
	default: 'page',
};

const pageOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['page'] } },
	options: [
		{
			name: 'Extract Contacts',
			value: 'extractContacts',
			description:
				'Find the emails, phone numbers and social links a page publishes. Costs 1 credit.',
			action: 'Extract contacts from a page',
		},
		{
			name: 'Extract Products',
			value: 'extractProducts',
			description: 'Read the product data a page publishes: names, prices, offers. Costs 1 credit.',
			action: 'Extract products from a page',
		},
		{
			name: 'Scrape Page',
			value: 'scrape',
			description:
				'Read a page as clean Markdown or HTML. Costs 1 credit, or 5 with Render JavaScript.',
			action: 'Scrape a page',
		},
	],
	default: 'scrape',
};

const searchOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['search'] } },
	options: [
		{
			name: 'News Search',
			value: 'newsSearch',
			description: 'Search news articles. Costs 3 credits.',
			action: 'Search news',
		},
		{
			name: 'Video Search',
			value: 'videoSearch',
			description: 'Search videos. Costs 3 credits.',
			action: 'Search videos',
		},
		{
			name: 'Web Search',
			value: 'webSearch',
			description: 'Search the web. Costs 3 credits.',
			action: 'Search the web',
		},
	],
	default: 'webSearch',
};

const urlProperty = (operations: string[], description: string): INodeProperties => ({
	displayName: 'URL',
	name: 'url',
	type: 'string',
	required: true,
	default: '',
	placeholder: 'https://example.com/page',
	description,
	displayOptions: { show: { resource: ['page'], operation: operations } },
});

const scrapeOnly = { show: { resource: ['page'], operation: ['scrape'] } };

const pageProperties: INodeProperties[] = [
	urlProperty(
		['scrape'],
		'The public http(s) page to read. Pages that robots.txt disallows or that cannot be fetched are refused and not charged.',
	),
	urlProperty(
		['extractContacts'],
		'The public http(s) page to look for contact details on. Only that page is read; linked contact pages are listed, not fetched.',
	),
	urlProperty(
		['extractProducts'],
		'The public http(s) product page. Needs published Product data (JSON-LD) in the page; if there is none the request is refused and not charged.',
	),
	{
		displayName: 'Format',
		name: 'format',
		type: 'options',
		default: 'markdown',
		options: [
			{
				name: 'Markdown',
				value: 'markdown',
				description: 'The main content as Markdown, in data.markdown',
			},
			{
				name: 'HTML',
				value: 'html',
				description: 'The raw page HTML, in data.html (up to 2 MB)',
			},
		],
		description:
			'What to return for the page body. The page text, links and metadata come back either way.',
		displayOptions: scrapeOnly,
	},
	{
		displayName: 'Render JavaScript',
		name: 'render',
		type: 'boolean',
		default: false,
		description:
			'Whether to load the page in a real browser first, so content built by JavaScript is included. Costs 5 credits instead of 1.',
		displayOptions: scrapeOnly,
	},
	{
		displayName: 'Fields to Extract',
		name: 'fields',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Field',
		default: {},
		description: `Pick out specific values with CSS selectors (up to ${MAX_EXTRACT_FIELDS} fields, no extra credits). Results come back under data.extracted. Works on the static page only, so not with Render JavaScript or the HTML format.`,
		displayOptions: scrapeOnly,
		options: [
			{
				displayName: 'Field',
				name: 'field',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						placeholder: 'price',
						description:
							'The key for this value in data.extracted. Starts with a letter, then letters, digits or underscores.',
					},
					{
						displayName: 'CSS Selector',
						name: 'selector',
						type: 'string',
						default: '',
						placeholder: '.price',
						description:
							'One tag, ID, class or attribute selector, such as h1, #main, .price or meta[name=description]. Descendant chains and pseudo-classes are not supported.',
					},
					{
						displayName: 'Attribute',
						name: 'attribute',
						type: 'string',
						default: '',
						placeholder: 'href',
						description:
							'Read this attribute (for example href or content) instead of the element text',
					},
					{
						displayName: 'Return Multiple',
						name: 'multiple',
						type: 'boolean',
						default: false,
						description:
							'Whether to return every match (up to 50) as a list instead of only the first',
					},
				],
			},
		],
	},
	{
		displayName: 'Marketplace',
		name: 'marketplace',
		type: 'options',
		default: 'auto',
		options: [
			{
				name: 'Auto-Detect',
				value: 'auto',
				description: 'Read the product data any store publishes in its page markup',
			},
			{ name: 'Amazon', value: 'amazon', description: 'Amazon product detail pages' },
			{ name: 'Shopee', value: 'shopee', description: 'Shopee product detail pages' },
			{ name: 'Walmart', value: 'walmart', description: 'Walmart product detail pages' },
		],
		description:
			'Use a marketplace-specific reader. These need a full HTTPS product detail URL (not a search, store or short link).',
		displayOptions: { show: { resource: ['page'], operation: ['extractProducts'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: scrapeOnly,
		options: [
			{ ...idempotencyKey },
			{
				displayName: 'Minimum Quality Score',
				name: 'minQualityScore',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 100 },
				default: 50,
				description:
					'Refuse a result whose Vera quality score (0 to 100) is below this. A refused result is not charged.',
			},
			{
				displayName: 'Wait For Selector',
				name: 'waitFor',
				type: 'string',
				default: '',
				placeholder: '.results',
				description:
					'With Render JavaScript: wait until this CSS selector appears before reading the page',
			},
			{
				displayName: 'Wait (Ms)',
				name: 'waitMs',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 3000 },
				default: 500,
				description:
					'With Render JavaScript: how long to wait after load before reading the page, from 0 to 3000',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: { resource: ['page'], operation: ['extractContacts', 'extractProducts'] },
		},
		options: [{ ...idempotencyKey }],
	},
];

const searchProperties: INodeProperties[] = [
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'best open source web scrapers',
		description: `What to search for, up to 500 characters. Quoted phrases and operators such as site: are kept as written. Each search costs 3 credits and returns up to ${SEARCH_MAX_RESULTS} results.`,
		displayOptions: { show: { resource: ['search'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: SEARCH_MAX_RESULTS },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['search'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['search'] } },
		options: [
			{
				displayName: 'Country',
				name: 'country',
				type: 'string',
				default: 'us',
				placeholder: 'us',
				description: 'Two-letter lowercase country code to localise results, such as us, gb or ae',
			},
			{ ...idempotencyKey },
			{
				displayName: 'Language',
				name: 'language',
				type: 'string',
				default: 'en',
				placeholder: 'en',
				description: 'Two-letter lowercase language code for results, such as en, fr or ar',
			},
		],
	},
];

export const veraProperties: INodeProperties[] = [
	resourceProperty,
	pageOperations,
	searchOperations,
	...pageProperties,
	...searchProperties,
];
