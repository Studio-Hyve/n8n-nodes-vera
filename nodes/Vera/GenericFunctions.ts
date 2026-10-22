import type { IDataObject, IHttpRequestOptions, IN8nHttpFullResponse } from 'n8n-workflow';

import {
	AI_ENGINES,
	AI_LIMITS,
	CREDITS_HEADER,
	DEPTH_MAX,
	KEYWORD_EXPANSIONS,
	KEYWORD_MAX_LIMIT,
	MAX_EXTRACT_FIELDS,
	MAX_TEXT,
	PRICING_URL,
	REQUEST_ID_HEADER,
	REQUEST_TIMEOUT_MS,
	RETRY_AFTER_HEADER,
	SEARCH_MAX_RESULTS,
	SERP_ADD_ONS,
	SERP_DEFAULT_FEATURES,
	SERP_ENGINES,
	SERP_MAX_DEPTH,
	TOOL_TIMEOUT_MS,
	VERA_BASE_URL,
} from './constants';

export type VeraOperation =
	| 'scrape'
	| 'extractContacts'
	| 'extractProducts'
	| 'webSearch'
	| 'newsSearch'
	| 'videoSearch'
	| 'serpSearch'
	| 'keywordIdeas'
	| 'aiAnswers'
	| 'geoQueryRadar'
	| 'companyFootprint';

/** Reads one node parameter for the current item. */
export type ParamGetter = (name: string, fallback?: unknown) => unknown;

/**
 * What buildRequestSpec produces: the endpoint, JSON body, optional retry-protection key and, for the
 * long-running search tools, how long the node waits for an answer.
 */
export interface RequestSpec {
	path: string;
	body: IDataObject;
	idempotencyKey?: string;
	timeoutMs?: number;
}

/** A parameter the user set cannot be sent as it is. Raised before any request, so nothing is charged. */
export class VeraInputError extends Error {
	readonly description?: string;

	constructor(message: string, description?: string) {
		super(message);
		this.name = 'VeraInputError';
		this.description = description;
	}
}

/** Vera answered with a non-2xx status. Carries the plain-language summary built by mapApiError. */
export class VeraApiError extends Error {
	readonly info: ApiErrorInfo;

	constructor(info: ApiErrorInfo) {
		super(info.message);
		this.name = 'VeraApiError';
		this.info = info;
	}
}

// A results page names its engine in the path (/serp/{engine}); buildSerp fills that in from a fixed
// list, so nothing the user types ever reaches a URL path.
const PATHS: Record<VeraOperation, string> = {
	scrape: '/scrape',
	extractContacts: '/contacts',
	extractProducts: '/products',
	webSearch: '/search',
	newsSearch: '/search/news',
	videoSearch: '/search/videos',
	serpSearch: '/serp',
	keywordIdeas: '/keywords/ideas',
	aiAnswers: '/ai/answers',
	geoQueryRadar: '/geo/radar/query',
	companyFootprint: '/company/footprint',
};

// The API's own rules for a custom extraction rule (ExtractionRule and ScrapePayload), mirrored so
// a mistake is reported with a useful sentence instead of the API's generic "Check these fields".
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;
const ATTRIBUTE_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const SIMPLE_SELECTOR =
	/^(?:[A-Za-z][A-Za-z0-9_-]*|\*)?(?:(?:[.#][A-Za-z_][A-Za-z0-9_-]*)|(?:\[[A-Za-z_][A-Za-z0-9_-]*(?:=(?:"[^"\\\]]*"|'[^'\\\]]*'|[A-Za-z0-9_-]+))?\]))*$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{16,128}$/;
const TWO_LETTERS = /^[a-z]{2}$/;
// The search tools lower-case these themselves, so they are accepted in any case here.
const LANGUAGE_CODE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;

/** True when the text holds a control character (code below 32, or DEL). */
function hasControlCharacters(value: string): boolean {
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code < 32 || code === 127) return true;
	}
	return false;
}

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function pageUrl(get: ParamGetter): string {
	const url = text(get('url', ''));
	if (!url) throw new VeraInputError('URL is required', 'Enter the public page address to read.');
	if (!/^https?:\/\//i.test(url) || url.length < 8 || url.length > 2048) {
		throw new VeraInputError(
			'URL must start with http:// or https://',
			'Vera reads public web pages: use a full address of at most 2,048 characters.',
		);
	}
	return url;
}

interface FieldRow {
	name?: string;
	selector?: string;
	attribute?: string;
	multiple?: boolean;
}

function extractRules(get: ParamGetter): Record<string, IDataObject> {
	const collection = get('fields', {}) as { field?: FieldRow[] } | undefined;
	const rows = collection?.field ?? [];
	if (rows.length > MAX_EXTRACT_FIELDS) {
		throw new VeraInputError(
			`Too many fields to extract (${rows.length})`,
			`Vera accepts at most ${MAX_EXTRACT_FIELDS} fields per scrape.`,
		);
	}
	const rules: Record<string, IDataObject> = {};
	for (const row of rows) {
		const name = text(row.name);
		const selector = text(row.selector);
		const attribute = text(row.attribute);
		if (!FIELD_NAME.test(name)) {
			throw new VeraInputError(
				`Invalid field name "${name}"`,
				'Names start with a letter and use letters, digits and underscores only (at most 50 characters).',
			);
		}
		if (name in rules) {
			throw new VeraInputError(
				`Field name "${name}" is used twice`,
				'Give each field its own name.',
			);
		}
		if (
			!selector ||
			selector.length > 200 ||
			hasControlCharacters(selector) ||
			!SIMPLE_SELECTOR.test(selector)
		) {
			throw new VeraInputError(
				`Unsupported CSS selector for "${name}"`,
				'Use one tag, #id, .class or [attribute] selector, such as h1, .price or meta[name=description]. Descendant chains, combinators and pseudo-classes are not supported.',
			);
		}
		const rule: IDataObject = { selector };
		if (attribute) {
			if (!ATTRIBUTE_NAME.test(attribute)) {
				throw new VeraInputError(
					`Invalid attribute "${attribute}" for "${name}"`,
					'Attribute names start with a letter and use letters, digits, hyphens and underscores.',
				);
			}
			rule.attribute = attribute;
		}
		if (row.multiple === true) rule.multiple = true;
		rules[name] = rule;
	}
	return rules;
}

function buildScrape(get: ParamGetter, options: IDataObject): IDataObject {
	const body: IDataObject = { url: pageUrl(get) };
	const render = get('render', false) === true;
	const asHtml = get('format', 'markdown') === 'html';
	const rules = extractRules(get);
	const hasRules = Object.keys(rules).length > 0;

	if (hasRules && render) {
		throw new VeraInputError(
			'Fields to Extract cannot be used with Render JavaScript',
			'Custom extraction reads the static page. Turn rendering off, or read the fields from the returned Markdown.',
		);
	}
	if (hasRules && asHtml) {
		throw new VeraInputError(
			'Fields to Extract cannot be combined with the HTML format',
			'Choose the Markdown format, or remove the fields.',
		);
	}

	if (render) body.render = true;
	if (asHtml) body.return_html = true;
	else body.response_format = 'markdown';
	if (hasRules) body.extract = rules;

	const waitMs = options.waitMs;
	const waitFor = text(options.waitFor);
	if (waitMs !== undefined || waitFor) {
		if (!render) {
			throw new VeraInputError(
				'Wait (Ms) and Wait For Selector need Render JavaScript',
				'Turn on Render JavaScript, or remove these options.',
			);
		}
		if (waitMs !== undefined) {
			if (!Number.isInteger(waitMs) || (waitMs as number) < 0 || (waitMs as number) > 3000) {
				throw new VeraInputError('Wait (Ms) must be a whole number from 0 to 3000');
			}
			body.wait_ms = waitMs;
		}
		if (waitFor) {
			if (waitFor.length > 200 || hasControlCharacters(waitFor)) {
				throw new VeraInputError('Wait For Selector is not a valid CSS selector');
			}
			body.wait_for = waitFor;
		}
	}

	const minQuality = options.minQualityScore;
	if (minQuality !== undefined && minQuality !== '') {
		if (
			!Number.isInteger(minQuality) ||
			(minQuality as number) < 0 ||
			(minQuality as number) > 100
		) {
			throw new VeraInputError('Minimum Quality Score must be a whole number from 0 to 100');
		}
		body.min_quality_score = minQuality;
	}
	return body;
}

function buildSearch(get: ParamGetter, options: IDataObject): IDataObject {
	const query = text(get('query', ''));
	if (!query) throw new VeraInputError('Query is required', 'Enter what to search for.');
	if (query.length > 500 || hasControlCharacters(query)) {
		throw new VeraInputError(
			'Query is not valid',
			'Use at most 500 characters and no control characters.',
		);
	}
	const limit = get('limit', 50) as number;
	if (!Number.isInteger(limit) || limit < 1 || limit > SEARCH_MAX_RESULTS) {
		throw new VeraInputError(
			`Limit must be a whole number from 1 to ${SEARCH_MAX_RESULTS}`,
			'A search costs the same 3 credits whatever the limit.',
		);
	}
	const body: IDataObject = { query, limit };
	for (const [option, key] of [
		['country', 'country'],
		['language', 'language'],
	] as const) {
		const value = text(options[option]);
		if (value) {
			if (!TWO_LETTERS.test(value)) {
				throw new VeraInputError(
					`${key === 'country' ? 'Country' : 'Language'} must be two lowercase letters`,
					key === 'country' ? 'For example us, gb or ae.' : 'For example en, fr or ar.',
				);
			}
			body[key] = value;
		}
	}
	return body;
}

// --- The search tools: results pages, keyword ideas, AI answers, query radar, company footprint ---
//
// These routes take any JSON object and the search service checks every field, so the checks below
// only catch what is certain (a missing required field, a number out of range, an unknown choice) and
// save a round trip. A 422 from the service is never charged either way.

function optionalText(value: unknown, label: string, max: number): string | undefined {
	const cleaned = text(value);
	if (!cleaned) return undefined;
	if (cleaned.length > max || hasControlCharacters(cleaned)) {
		throw new VeraInputError(
			`${label} is not valid`,
			`Use at most ${max} characters and no control characters.`,
		);
	}
	return cleaned;
}

function requiredText(value: unknown, label: string, max: number, hint: string): string {
	const cleaned = optionalText(value, label, max);
	if (!cleaned) throw new VeraInputError(`${label} is required`, hint);
	return cleaned;
}

function wholeNumber(
	value: unknown,
	label: string,
	min: number,
	max: number,
	hint?: string,
): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
		throw new VeraInputError(`${label} must be a whole number from ${min} to ${max}`, hint);
	}
	return value;
}

/** Country, language and place, shared by the five search tools. Country and language are optional. */
function addMarket(
	body: IDataObject,
	options: IDataObject,
	names: { country: string; language: string },
): void {
	const country = text(options.country).toLowerCase();
	if (country) {
		if (!TWO_LETTERS.test(country)) {
			throw new VeraInputError('Country must be two letters', 'For example us, gb or ae.');
		}
		body[names.country] = country;
	}
	const language = text(options.language).toLowerCase();
	if (language) {
		if (!LANGUAGE_CODE.test(language)) {
			throw new VeraInputError('Language must be a language code', 'For example en, ar or pt-br.');
		}
		body[names.language] = language;
	}
}

function addLocation(body: IDataObject, options: IDataObject): void {
	const location = optionalText(options.location, 'Location', MAX_TEXT.location);
	if (location) body.location = location;
}

function addFresh(body: IDataObject, options: IDataObject): void {
	if (options.fresh === true) body.fresh = true;
}

function buildSerp(get: ParamGetter, options: IDataObject): { path: string; body: IDataObject } {
	const engine = text(get('engine', 'google'));
	if (!(SERP_ENGINES as readonly string[]).includes(engine)) {
		throw new VeraInputError(
			`Unknown search engine "${engine}"`,
			`Choose one of: ${SERP_ENGINES.join(', ')}.`,
		);
	}
	const body: IDataObject = {
		q: requiredText(get('query', ''), 'Query', MAX_TEXT.query, 'Enter what to search for.'),
		depth: wholeNumber(
			get('depth', 10),
			'Depth',
			1,
			SERP_MAX_DEPTH,
			'Each ten results is one results page, so a larger depth costs more.',
		),
	};
	addMarket(body, options, { country: 'gl', language: 'hl' });
	addLocation(body, options);
	addFresh(body, options);

	const addOns = (get('addOns', []) as string[] | undefined) ?? [];
	const unknown = addOns.find((addOn) => !(SERP_ADD_ONS as readonly string[]).includes(addOn));
	if (unknown !== undefined) {
		throw new VeraInputError(
			`Unknown add-on "${unknown}"`,
			`Choose from: ${SERP_ADD_ONS.join(', ')}.`,
		);
	}
	if (addOns.length > 0) {
		if (engine !== 'google') {
			throw new VeraInputError(
				'Local Pack and Shopping are Google add-ons',
				'Choose Google as the engine, or turn the add-ons off.',
			);
		}
		body.features = [...SERP_DEFAULT_FEATURES, ...new Set(addOns)];
	}
	return { path: `${PATHS.serpSearch}/${engine}`, body };
}

function buildKeywordIdeas(get: ParamGetter, options: IDataObject): IDataObject {
	const expand = text(get('expand', 'questions'));
	if (!(KEYWORD_EXPANSIONS as readonly string[]).includes(expand)) {
		throw new VeraInputError(
			`Unknown expansion "${expand}"`,
			`Choose one of: ${KEYWORD_EXPANSIONS.join(', ')}.`,
		);
	}
	const body: IDataObject = {
		seed: requiredText(
			get('seed', ''),
			'Seed',
			200,
			'Enter the keyword to find ideas for, at most 200 characters.',
		),
		limit: wholeNumber(get('limit', 50), 'Limit', 1, KEYWORD_MAX_LIMIT),
		expand,
	};
	addMarket(body, options, { country: 'gl', language: 'hl' });
	addLocation(body, options);
	addFresh(body, options);
	return body;
}

/** The names to look for besides the brand: one per line or comma, each once, in the order typed. */
export function parseCompetitors(value: unknown): string[] {
	const seen = new Set<string>();
	const names: string[] = [];
	for (const part of text(value).split(/[\n,،]+/)) {
		const name = part.trim();
		if (name && !seen.has(name.toLowerCase())) {
			seen.add(name.toLowerCase());
			names.push(name);
		}
	}
	return names;
}

function buildAiAnswers(get: ParamGetter, options: IDataObject): IDataObject {
	const engines = ((get('engines', ['chatgpt']) as string[] | undefined) ?? []).map((engine) =>
		String(engine).toLowerCase(),
	);
	if (engines.length === 0) {
		throw new VeraInputError(
			'Choose at least one AI assistant',
			'Leaving the list empty would ask every assistant, which is the most expensive way to run this.',
		);
	}
	const unknown = engines.find((engine) => !(AI_ENGINES as readonly string[]).includes(engine));
	if (unknown !== undefined) {
		throw new VeraInputError(
			`Unknown AI assistant "${unknown}"`,
			`Choose from: ${AI_ENGINES.join(', ')}.`,
		);
	}
	const body: IDataObject = {
		prompt: requiredText(
			get('prompt', ''),
			'Question',
			AI_LIMITS.prompt,
			'Enter the question a buyer would ask the assistant.',
		),
		brand: requiredText(
			get('brand', ''),
			'Brand',
			AI_LIMITS.brand,
			'Enter the brand name to look for in the answers.',
		),
		engines: [...new Set(engines)],
		samples: wholeNumber(
			get('samples', 1),
			'Samples',
			1,
			AI_LIMITS.samples,
			'Each sample is a separate paid call to the assistant.',
		),
	};
	const brandDomain = optionalText(get('brandDomain', ''), 'Brand Domain', 253);
	if (brandDomain) body.brand_domain = brandDomain;
	const competitors = parseCompetitors(get('competitors', ''));
	if (
		competitors.length > AI_LIMITS.competitors ||
		competitors.some((name) => name.length > AI_LIMITS.competitor)
	) {
		throw new VeraInputError(
			'Too many or too long competitor names',
			`Use up to ${AI_LIMITS.competitors} competitors of at most ${AI_LIMITS.competitor} characters each.`,
		);
	}
	if (competitors.length > 0) body.competitors = competitors;
	addMarket(body, options, { country: 'country', language: 'language' });
	const city = optionalText(options.city, 'City', AI_LIMITS.city);
	if (city) body.city = city;
	return body;
}

function buildGeoQueryRadar(get: ParamGetter, options: IDataObject): IDataObject {
	const body: IDataObject = {
		query: requiredText(
			get('query', ''),
			'Query',
			MAX_TEXT.query,
			'Enter the topic query to look at, such as "best coffee roasters in dubai".',
		),
		depth: wholeNumber(
			get('depth', 30),
			'Depth',
			1,
			DEPTH_MAX,
			'Depth is how many organic results are read.',
		),
	};
	const brand = optionalText(get('brand', ''), 'Brand', MAX_TEXT.brand);
	if (brand) body.brand = brand;
	const domain = optionalText(get('domain', ''), 'Domain', 253);
	if (domain) body.domain = domain;
	addMarket(body, options, { country: 'gl', language: 'hl' });
	addLocation(body, options);
	addFresh(body, options);
	return body;
}

function buildCompanyFootprint(get: ParamGetter, options: IDataObject): IDataObject {
	const body: IDataObject = {
		company: requiredText(
			get('company', ''),
			'Company',
			MAX_TEXT.company,
			'Enter the company or brand name.',
		),
		depth: wholeNumber(
			get('depth', 20),
			'Depth',
			1,
			DEPTH_MAX,
			'Depth is how many organic results are read.',
		),
	};
	const domain = optionalText(get('domain', ''), 'Domain', 253);
	if (domain) body.domain = domain;
	addMarket(body, options, { country: 'gl', language: 'hl' });
	addLocation(body, options);
	addFresh(body, options);
	return body;
}

/** How long the node waits for each operation. Page and search calls use the default. */
const TIMEOUTS: Partial<Record<VeraOperation, number>> = {
	serpSearch: TOOL_TIMEOUT_MS.serp,
	keywordIdeas: TOOL_TIMEOUT_MS.keywordIdeas,
	geoQueryRadar: TOOL_TIMEOUT_MS.geoQueryRadar,
	companyFootprint: TOOL_TIMEOUT_MS.companyFootprint,
	aiAnswers: TOOL_TIMEOUT_MS.aiAnswers,
};

/** Turns the node's parameters into the API call, or throws VeraInputError. Pure and unit-tested. */
export function buildRequestSpec(operation: VeraOperation, get: ParamGetter): RequestSpec {
	if (!(operation in PATHS)) {
		throw new VeraInputError(`Unknown operation "${String(operation)}"`);
	}
	const options = (get('options', {}) as IDataObject | undefined) ?? {};
	let path = PATHS[operation];
	let body: IDataObject;
	switch (operation) {
		case 'scrape':
			body = buildScrape(get, options);
			break;
		case 'extractContacts':
			body = { url: pageUrl(get) };
			break;
		case 'extractProducts': {
			body = { url: pageUrl(get) };
			const marketplace = get('marketplace', 'auto');
			if (marketplace && marketplace !== 'auto') body.marketplace = marketplace as string;
			break;
		}
		case 'serpSearch':
			({ path, body } = buildSerp(get, options));
			break;
		case 'keywordIdeas':
			body = buildKeywordIdeas(get, options);
			break;
		case 'aiAnswers':
			body = buildAiAnswers(get, options);
			break;
		case 'geoQueryRadar':
			body = buildGeoQueryRadar(get, options);
			break;
		case 'companyFootprint':
			body = buildCompanyFootprint(get, options);
			break;
		default:
			body = buildSearch(get, options);
	}
	const spec: RequestSpec = { path, body };
	const timeoutMs = TIMEOUTS[operation];
	if (timeoutMs !== undefined) spec.timeoutMs = timeoutMs;
	const key = text(options.idempotencyKey);
	if (key) {
		if (!IDEMPOTENCY_KEY.test(key)) {
			throw new VeraInputError(
				'Idempotency Key is not valid',
				'Use 16 to 128 letters, digits, underscores, dots, colons or hyphens.',
			);
		}
		spec.idempotencyKey = key;
	}
	return spec;
}

/**
 * The API address from the credential's Base URL field, without a trailing slash. An empty field
 * means the production API. The key goes to this address, so it must be https (plain http only for a
 * local development server).
 */
export function resolveBaseUrl(value: unknown): string {
	const raw = typeof value === 'string' ? value.trim() : '';
	if (!raw) return VERA_BASE_URL;
	const url = parseUrl(raw);
	if (!url) {
		throw new VeraInputError(
			"The credential's Base URL is not a valid address",
			`Use a full address such as ${VERA_BASE_URL}.`,
		);
	}
	const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
		throw new VeraInputError(
			"The credential's Base URL must use https",
			'The API key is sent to this address, so only https is accepted (http only for localhost).',
		);
	}
	return raw.replace(/\/+$/, '');
}

function parseUrl(raw: string): URL | undefined {
	try {
		return new URL(raw);
	} catch {
		return undefined;
	}
}

/** The HTTP request n8n sends. Auth is added by httpRequestWithAuthentication from the credential. */
export function toHttpOptions(
	spec: RequestSpec,
	baseUrl: string = VERA_BASE_URL,
): IHttpRequestOptions {
	return {
		method: 'POST',
		url: `${baseUrl}${spec.path}`,
		body: spec.body,
		headers: {
			Accept: 'application/json',
			...(spec.idempotencyKey ? { 'Idempotency-Key': spec.idempotencyKey } : {}),
		},
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		timeout: spec.timeoutMs ?? REQUEST_TIMEOUT_MS,
	};
}

function header(response: IN8nHttpFullResponse, name: string): string | undefined {
	const value = response.headers?.[name];
	if (Array.isArray(value)) return value[0] === undefined ? undefined : String(value[0]);
	return value === undefined || value === null ? undefined : String(value);
}

function asObject(value: unknown): IDataObject | undefined {
	if (typeof value === 'string') {
		try {
			return asObject(JSON.parse(value));
		} catch {
			return undefined;
		}
	}
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as IDataObject)
		: undefined;
}

/** True for a 2xx answer. */
export function isSuccess(response: IN8nHttpFullResponse): boolean {
	return response.statusCode >= 200 && response.statusCode < 300;
}

/**
 * The output item: the API's JSON, with `credits_used` and `request_id` always present.
 *
 * `credits_used` is what this call was charged. The X-Waggle-Credits-Used header is the authority
 * (it is 0 on an idempotent replay, whose stored body still shows the original charge); the body
 * value is the fallback.
 */
export function parseSuccess(response: IN8nHttpFullResponse): IDataObject {
	const body = asObject(response.body);
	if (!body) {
		throw new VeraApiError({
			message: 'Vera returned an unexpected response',
			description:
				'The answer was not a JSON object. Try again, and contact Vera support if it repeats.',
			httpCode: response.statusCode,
		});
	}
	const result: IDataObject = { ...body };
	const used = Number.parseInt(header(response, CREDITS_HEADER) ?? '', 10);
	if (!Number.isNaN(used)) result.credits_used = used;
	else if (typeof result.credits_used !== 'number') result.credits_used = 0;
	const requestId = header(response, REQUEST_ID_HEADER);
	if (result.request_id === undefined && requestId) result.request_id = requestId;
	if (header(response, 'x-waggle-idempotency-replayed') === 'true')
		result.idempotency_replayed = true;
	return result;
}

export interface ApiErrorInfo {
	message: string;
	description: string;
	httpCode: number;
	code?: string;
	requestId?: string;
	retryAfterSeconds?: number;
	creditsUsed?: number;
}

function serverMessage(body: unknown): { message: string; code?: string } {
	const parsed = asObject(body);
	const error = parsed?.error;
	if (typeof error === 'string') return { message: error };
	const detail = asObject(error);
	if (!detail) return { message: '' };
	return {
		message: typeof detail.message === 'string' ? detail.message : '',
		code: typeof detail.code === 'string' ? detail.code : undefined,
	};
}

/**
 * A non-2xx answer as a short title plus a description a person can act on. The HTTP status is the
 * reliable signal: the API's `error.code` is only meaningful for failed fetches and searches (422, 502).
 */
export function mapApiError(response: IN8nHttpFullResponse): ApiErrorInfo {
	const status = response.statusCode;
	const { message: said, code } = serverMessage(response.body);
	const retry = Number.parseInt(header(response, RETRY_AFTER_HEADER) ?? '', 10);
	const used = Number.parseInt(header(response, CREDITS_HEADER) ?? '', 10);
	const retryAfterSeconds = Number.isNaN(retry) ? undefined : retry;
	const creditsUsed = Number.isNaN(used) ? undefined : used;
	const detail = said ? `Vera said: ${said}` : '';
	let message: string;
	let advice: string;
	switch (status) {
		case 401:
			message = 'Vera rejected the API key';
			advice =
				'The key is missing, invalid, expired or revoked. Create a key under API keys in your Vera workspace and update the Vera API credential.';
			break;
		case 402:
			message = 'Not enough Vera credits';
			advice = `Add credits or choose a plan at ${PRICING_URL}.`;
			break;
		case 403:
			message = 'Vera refused the request';
			advice = 'Your account may need an action first, such as confirming your email address.';
			break;
		case 409:
		case 410:
			message = 'Vera could not run the request';
			advice =
				'This usually means an idempotency key was reused or its request is still running. Use a new key, or wait and retry the same one.';
			break;
		case 400:
		case 422:
			message = 'Invalid input';
			advice =
				'Check the parameters, and for a page operation that the page is public and reachable.';
			break;
		case 429:
			message = 'Vera rate limit reached';
			advice =
				retryAfterSeconds === undefined
					? 'Wait a moment and try again.'
					: `Try again in ${retryAfterSeconds} seconds.`;
			break;
		case 502:
		case 503:
			message = 'Vera is temporarily unavailable';
			advice =
				retryAfterSeconds === undefined
					? 'Try again shortly.'
					: `Try again in ${retryAfterSeconds} seconds.`;
			break;
		case 504:
			message = 'Vera timed out';
			advice =
				'The service behind this operation took too long to answer. Try again, or ask for less: a smaller Depth, fewer Samples or one assistant.';
			break;
		default:
			message = status >= 500 ? 'Vera had an internal error' : `Vera returned HTTP ${status}`;
			advice = status >= 500 ? 'Try again shortly.' : '';
	}
	// A refused or failed call is not charged. The header is the proof; a 503 or 504 that carries no
	// header is still one Vera documents as not charged.
	const unavailable = status === 503 || status === 504;
	const notCharged =
		creditsUsed === 0 || (unavailable && creditsUsed === undefined)
			? 'No credits were charged.'
			: '';
	const useful = status === 422 || status === 502 ? code : undefined;
	return {
		message,
		description: [detail, advice, notCharged].filter(Boolean).join(' '),
		httpCode: status,
		code: useful,
		requestId: header(response, REQUEST_ID_HEADER),
		retryAfterSeconds,
		creditsUsed,
	};
}

/** The item emitted for a failed call when "Continue on Fail" is on. */
export function errorToJson(error: unknown): IDataObject {
	const message = error instanceof Error ? error.message : String(error);
	if (error instanceof VeraApiError) return apiErrorToJson(error.info);
	if (error instanceof VeraInputError) {
		return { error: message, ...(error.description ? { description: error.description } : {}) };
	}
	return { error: message };
}

/** The same item built from a mapped API error, so the rich fields survive "Continue on Fail". */
export function apiErrorToJson(info: ApiErrorInfo): IDataObject {
	return {
		error: info.message,
		description: info.description,
		status_code: info.httpCode,
		...(info.code ? { code: info.code } : {}),
		...(info.requestId ? { request_id: info.requestId } : {}),
		...(info.retryAfterSeconds === undefined
			? {}
			: { retry_after_seconds: info.retryAfterSeconds }),
		...(info.creditsUsed === undefined ? {} : { credits_used: info.creditsUsed }),
	};
}
