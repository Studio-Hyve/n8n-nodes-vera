import type { INodeProperties } from 'n8n-workflow';

import {
	AI_LIMITS,
	DEPTH_MAX,
	KEYWORD_MAX_LIMIT,
	MAX_EXTRACT_FIELDS,
	MAX_TEXT,
	SEARCH_MAX_RESULTS,
	SERP_MAX_DEPTH,
} from './constants';

const idempotencyKey: INodeProperties = {
	displayName: 'Idempotency Key',
	name: 'idempotencyKey',
	type: 'string',
	default: '',
	placeholder: 'daily-report-2026-01-01-item-0',
	description:
		'Protects a retried call from being charged twice. Repeating the same key and request within 24 hours returns the first result at no cost, and a failed call is replayed too, so retry a failed call with a new key. 16 to 128 letters, digits, underscores, dots, colons or hyphens.',
};

export const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{
			name: 'AI Answer',
			value: 'aiAnswers',
			description: 'Ask AI assistants a question and see whether a brand is named in the answer',
		},
		{
			name: 'Company',
			value: 'company',
			description: 'See how a company shows up in search',
		},
		{
			name: 'GEO Radar',
			value: 'geoRadar',
			description: 'Check how likely AI answers are to cite a brand for one query',
		},
		{ name: 'Keyword', value: 'keyword', description: 'Find keyword ideas for a seed keyword' },
		{ name: 'Page', value: 'page', description: 'Read a public web page' },
		{ name: 'Search', value: 'search', description: 'Search the web, news or videos' },
		{
			name: 'SERP',
			value: 'serp',
			description:
				'Read a full search results page (SERP) of Google, Bing, DuckDuckGo, Brave or Yahoo',
		},
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

const serpOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['serp'] } },
	options: [
		{
			name: 'Get Results Page',
			value: 'serpSearch',
			description:
				'Read a full results page: organic results tagged by kind, and on Google the AI Overview, People Also Ask and Knowledge Graph. Priced by what comes back: you are charged for what is served, never more than the amount held first. A failed call is not charged.',
			action: 'Get a search results page',
		},
	],
	default: 'serpSearch',
};

const keywordOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['keyword'] } },
	options: [
		{
			name: 'Get Ideas',
			value: 'keywordIdeas',
			description:
				'Find keyword ideas for a seed from autocomplete, People Also Ask and related searches, each with its sources and an intent label. Ideas only, no search volumes. Priced by what comes back: you are charged for what is served, never more than the amount held first. A failed call is not charged.',
			action: 'Get keyword ideas',
		},
	],
	default: 'keywordIdeas',
};

const aiAnswersOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['aiAnswers'] } },
	options: [
		{
			name: 'Check Brand in AI Answers',
			value: 'aiAnswers',
			description:
				"Put a buyer's question to ChatGPT, Claude or Gemini and see whether your brand and competitors are named, in what order, with the citations and share of voice. The most expensive operation: each assistant call is priced on its own. Priced by what comes back: you are charged for what is served, never more than the amount held first. A failed call is not charged.",
			action: 'Check a brand in AI answers',
		},
	],
	default: 'aiAnswers',
};

const geoOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['geoRadar'] } },
	options: [
		{
			name: 'Run Query Radar',
			value: 'geoQueryRadar',
			description:
				'Look at one topic query and your brand in depth: citation probability (0 to 100), forum threads worth joining, list articles that name your competitors and question gaps. Priced by what comes back: you are charged for what is served, never more than the amount held first. A failed call is not charged.',
			action: 'Run a GEO query radar',
		},
	],
	default: 'geoQueryRadar',
};

const companyOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['company'] } },
	options: [
		{
			name: 'Get Search Footprint',
			value: 'companyFootprint',
			description:
				'Audit how a company shows up in search: its own web properties, social and reference profiles, map listings, what third parties say and the questions people ask. Priced by what comes back: you are charged for what is served, never more than the amount held first. A failed call is not charged.',
			action: 'Get a company search footprint',
		},
	],
	default: 'companyFootprint',
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
			'Use a marketplace-specific reader. These need a full HTTPS product detail URL (not a search, store or short link) and are best-effort: large marketplaces often block automated requests, and a failed request costs nothing.',
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

// --- Search results page (SERP) ---------------------------------------------------------------

const serpOnly = { show: { resource: ['serp'] } };

const countryOption = (defaultValue: string, description: string): INodeProperties => ({
	displayName: 'Country',
	name: 'country',
	type: 'string',
	default: defaultValue,
	placeholder: 'ae',
	description,
});

const languageOption = (defaultValue: string, description: string): INodeProperties => ({
	displayName: 'Language',
	name: 'language',
	type: 'string',
	default: defaultValue,
	placeholder: 'en',
	description,
});

const freshOption: INodeProperties = {
	displayName: 'Skip Cache',
	name: 'fresh',
	type: 'boolean',
	default: false,
	description:
		'Whether to search live instead of reusing a result searched in the last 24 hours. A cached result costs less; a live one costs the full price and replaces what was cached.',
};

const serpProperties: INodeProperties[] = [
	{
		displayName: 'Engine',
		name: 'engine',
		type: 'options',
		default: 'google',
		options: [
			{ name: 'Bing', value: 'bing' },
			{ name: 'Brave', value: 'brave' },
			{ name: 'DuckDuckGo', value: 'duckduckgo' },
			{ name: 'Google', value: 'google' },
			{ name: 'Yahoo', value: 'yahoo' },
		],
		description:
			'The search engine to read. The AI Overview, Knowledge Graph and the Local Pack and Shopping add-ons are Google features.',
		displayOptions: serpOnly,
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'best coffee in dubai',
		description: `What to search for, up to ${MAX_TEXT.query} characters. Operators such as site: are kept as written.`,
		displayOptions: serpOnly,
	},
	{
		displayName: 'Depth',
		name: 'depth',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: SERP_MAX_DEPTH },
		default: 10,
		description:
			'How many results to read, 1 to 100. Every ten results is one results page, so a larger depth costs more.',
		displayOptions: serpOnly,
	},
	{
		displayName: 'Add-Ons',
		name: 'addOns',
		type: 'multiOptions',
		default: [],
		options: [
			{
				name: 'Local Pack (Map Listings)',
				value: 'local_pack',
				description:
					'The Google Maps listings for the query: name, rating, address, phone and website. Needs a Location in the options for a local query.',
			},
			{
				name: 'Shopping',
				value: 'shopping',
				description: 'The Google Shopping carousel: product, price, merchant and rating',
			},
		],
		description:
			'Extra Google features to read besides the results page. Each add-on is priced on its own, once per request, and only when it returns something.',
		displayOptions: { show: { resource: ['serp'], engine: ['google'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: serpOnly,
		options: [
			countryOption('us', 'Two-letter country code to localise results, such as us, gb or ae'),
			freshOption,
			{ ...idempotencyKey },
			languageOption('en', 'Language code for the results page, such as en, ar or pt-br'),
			{
				displayName: 'Location',
				name: 'location',
				type: 'string',
				default: '',
				placeholder: 'Dubai',
				description: 'A city or region to search from, such as Dubai or Austin, Texas',
			},
		],
	},
];

// --- Keyword ideas ---------------------------------------------------------------------------

const keywordOnly = { show: { resource: ['keyword'] } };

const keywordProperties: INodeProperties[] = [
	{
		displayName: 'Seed',
		name: 'seed',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'specialty coffee',
		description:
			'The keyword to find ideas for, up to 200 characters. Works in Arabic. Ideas only: no search volumes.',
		displayOptions: keywordOnly,
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: KEYWORD_MAX_LIMIT },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: keywordOnly,
	},
	{
		displayName: 'Expand',
		name: 'expand',
		type: 'options',
		default: 'questions',
		options: [
			{
				name: 'All',
				value: 'all',
				description: 'Question words and the alphabet. The most calls.',
			},
			{
				name: 'Alphabet',
				value: 'alphabet',
				description: 'Add each letter after the seed. Many calls.',
			},
			{ name: 'None', value: 'none', description: 'The seed on its own. The fewest calls.' },
			{
				name: 'Questions',
				value: 'questions',
				description: 'Put question words (how, what, why) before the seed',
			},
		],
		description:
			'How many autocomplete calls to make. More calls find more ideas and cost more. It stops early once the limit is reached.',
		displayOptions: keywordOnly,
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: keywordOnly,
		options: [
			countryOption('', 'Two-letter country code, such as ae. Taken from the location when empty.'),
			freshOption,
			{ ...idempotencyKey },
			languageOption(
				'',
				'Language code, such as en or ar. Arabic for an Arabic seed, otherwise English, when empty.',
			),
			{
				displayName: 'Location',
				name: 'location',
				type: 'string',
				default: '',
				placeholder: 'Dubai',
				description: 'A city or region name to find local ideas for',
			},
		],
	},
];

// --- AI answers ------------------------------------------------------------------------------

const aiOnly = { show: { resource: ['aiAnswers'] } };

const aiAnswersProperties: INodeProperties[] = [
	{
		displayName: 'Question',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 2 },
		required: true,
		default: '',
		placeholder: 'What are the best specialty coffee roasters in Dubai?',
		description: `The question to put to each assistant, as a buyer would ask it. Up to ${AI_LIMITS.prompt} characters.`,
		displayOptions: aiOnly,
	},
	{
		displayName: 'Brand',
		name: 'brand',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Roasters',
		description: 'The brand name to look for in the answers',
		displayOptions: aiOnly,
	},
	{
		displayName: 'Brand Domain',
		name: 'brandDomain',
		type: 'string',
		default: '',
		placeholder: 'roasters.ae',
		description:
			"The brand's website, such as roasters.ae. It lets Vera tell whether the assistant cited your site.",
		displayOptions: aiOnly,
	},
	{
		displayName: 'Competitors',
		name: 'competitors',
		type: 'string',
		default: '',
		placeholder: 'Other Roasters, rivals.ae',
		description: `Competitor names or domains to look for as well, separated by commas, up to ${AI_LIMITS.competitors}. They give you the share of voice.`,
		displayOptions: aiOnly,
	},
	{
		displayName: 'Assistants',
		name: 'engines',
		type: 'multiOptions',
		default: ['chatgpt'],
		options: [
			{ name: 'ChatGPT', value: 'chatgpt' },
			{ name: 'Claude', value: 'claude', description: 'The most expensive assistant to ask' },
			{ name: 'Gemini', value: 'gemini' },
		],
		description:
			'Which AI assistants to ask. Each one you pick is a separate paid call. Choose at least one: leaving the list empty would ask them all.',
		displayOptions: aiOnly,
	},
	{
		displayName: 'Samples',
		name: 'samples',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: AI_LIMITS.samples },
		default: 1,
		description:
			'How many times to ask each assistant the same question, 1 to 5, to get a mention rate. Every sample is a separate paid call.',
		displayOptions: aiOnly,
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: aiOnly,
		options: [
			{
				displayName: 'City',
				name: 'city',
				type: 'string',
				default: '',
				placeholder: 'Dubai',
				description: 'A city to localise the question to',
			},
			countryOption('ae', 'Two-letter country code of the market. The API uses ae when empty.'),
			{ ...idempotencyKey },
			languageOption('en', 'Language code of the market, such as en or ar'),
		],
	},
];

// --- GEO query radar -------------------------------------------------------------------------

const geoOnly = { show: { resource: ['geoRadar'] } };

const geoRadarProperties: INodeProperties[] = [
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'best specialty coffee roasters in dubai',
		description: `The topic query to look at, up to ${MAX_TEXT.query} characters`,
		displayOptions: geoOnly,
	},
	{
		displayName: 'Brand',
		name: 'brand',
		type: 'string',
		default: '',
		placeholder: 'Roasters',
		description: 'The brand name to evaluate',
		displayOptions: geoOnly,
	},
	{
		displayName: 'Domain',
		name: 'domain',
		type: 'string',
		default: '',
		placeholder: 'roasters.ae',
		description: "The brand's website, such as roasters.ae",
		displayOptions: geoOnly,
	},
	{
		displayName: 'Depth',
		name: 'depth',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: DEPTH_MAX },
		default: 30,
		description: 'How many organic results to read, 1 to 100',
		displayOptions: geoOnly,
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: geoOnly,
		options: [
			countryOption('ae', 'Two-letter country code. The API uses ae when empty.'),
			freshOption,
			{ ...idempotencyKey },
			languageOption('en', 'Language code, such as en or ar'),
			{
				displayName: 'Location',
				name: 'location',
				type: 'string',
				default: 'Dubai',
				placeholder: 'Dubai',
				description:
					'A city or region to search from. The API uses Dubai when empty, so set it for any other market.',
			},
		],
	},
];

// --- Company footprint -----------------------------------------------------------------------

const companyOnly = { show: { resource: ['company'] } };

const companyProperties: INodeProperties[] = [
	{
		displayName: 'Company',
		name: 'company',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Roasters',
		description: 'The company or brand name',
		displayOptions: companyOnly,
	},
	{
		displayName: 'Domain',
		name: 'domain',
		type: 'string',
		default: '',
		placeholder: 'roasters.ae',
		description:
			"The company's official website, such as roasters.ae. It tells its own properties from the rest.",
		displayOptions: companyOnly,
	},
	{
		displayName: 'Depth',
		name: 'depth',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: DEPTH_MAX },
		default: 20,
		description: 'How many organic results to read, 1 to 100',
		displayOptions: companyOnly,
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: companyOnly,
		options: [
			countryOption('ae', 'Two-letter country code. The API uses ae when empty.'),
			freshOption,
			{ ...idempotencyKey },
			languageOption('en', 'Language code, such as en or ar'),
			{
				displayName: 'Location',
				name: 'location',
				type: 'string',
				default: 'Dubai',
				placeholder: 'Dubai',
				description:
					'A city or region to search from. The API uses Dubai when empty, so set it for any other market.',
			},
		],
	},
];

export const veraProperties: INodeProperties[] = [
	resourceProperty,
	pageOperations,
	searchOperations,
	serpOperations,
	keywordOperations,
	aiAnswersOperations,
	geoOperations,
	companyOperations,
	...pageProperties,
	...searchProperties,
	...serpProperties,
	...keywordProperties,
	...aiAnswersProperties,
	...geoRadarProperties,
	...companyProperties,
];
