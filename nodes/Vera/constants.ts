/**
 * Default base URL: the direct Vera API. The website's /api/vera proxy does not carry the newer
 * routes and gives up on a long request after 40 seconds, so it is not used. The credential can
 * override this for a staging Vera.
 */
export const VERA_BASE_URL = 'https://vera.waggle.ae/v1';

/** Response header that reports the credits a call used (lower-cased, as n8n exposes headers). */
export const CREDITS_HEADER = 'x-waggle-credits-used';

/** Response header with the request id, for support and the Activity view. */
export const REQUEST_ID_HEADER = 'x-waggle-request-id';

/** Retry-After, in seconds, on 429 and some 409 and 503 answers. */
export const RETRY_AFTER_HEADER = 'retry-after';

/** Where to add credits or change plan. Quoted in the out-of-credits error. */
export const PRICING_URL = 'https://vera.waggle.ae/pricing';

/** Per-request client timeout. Rendered pages can take a while; the API caps a call itself. */
export const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Client timeouts of the search tools, in milliseconds. The API's own limits are 30 s for a results
 * page, 60 s for keyword ideas and the query radar, 45 s for a company footprint and 150 s for AI
 * answers, each after a few seconds to price the call; a margin goes on top so that Vera answers
 * (a 504, not charged) before the node gives up.
 */
export const TOOL_TIMEOUT_MS = {
	serp: 50_000,
	keywordIdeas: 80_000,
	geoQueryRadar: 80_000,
	companyFootprint: 65_000,
	aiAnswers: 175_000,
} as const;

/** Search returns at most this many rows per call (the schema accepts more but serves 100). */
export const SEARCH_MAX_RESULTS = 100;

/** The API accepts at most this many extraction fields on one scrape. */
export const MAX_EXTRACT_FIELDS = 10;

/** The engines POST /v1/serp/{engine} answers for. Any other is a 404. */
export const SERP_ENGINES = ['google', 'bing', 'duckduckgo', 'brave', 'yahoo'] as const;

/** One results page holds ten results; depth is capped at 100 (ten pages). */
export const SERP_MAX_DEPTH = 100;

/** Add-ons a Google results page can carry. Each is priced on its own. */
export const SERP_ADD_ONS = ['local_pack', 'shopping'] as const;

/** What a results page returns when no features are named. The add-ons are sent on top of it. */
export const SERP_DEFAULT_FEATURES = ['organic', 'paa', 'ai_overview'] as const;

/** How many autocomplete calls keyword ideas make. More calls find more ideas and cost more. */
export const KEYWORD_EXPANSIONS = ['none', 'questions', 'alphabet', 'all'] as const;

/** Keyword ideas returns at most this many ideas. */
export const KEYWORD_MAX_LIMIT = 200;

/** The AI assistants the API names. The node offers the first three; Perplexity answers when set up. */
export const AI_ENGINES = ['chatgpt', 'claude', 'gemini', 'perplexity'] as const;

/** Limits of POST /v1/ai/answers, from the service's own request model. */
export const AI_LIMITS = {
	prompt: 1000,
	brand: 200,
	competitor: 200,
	competitors: 20,
	city: 100,
	samples: 5,
} as const;

/** Depth bounds of the query radar and the company footprint (organic results fetched). */
export const DEPTH_MAX = 100;

/** Longest text a name, a city or a free-text field may be, as the API takes it. */
export const MAX_TEXT = { query: 500, location: 200, company: 200, brand: 200 } as const;

/** Credits per call, from GET /portal/capabilities. Rendering replaces the 1 credit page cost. */
export const CREDITS = {
	page: 1,
	renderedPage: 5,
	contacts: 1,
	products: 1,
	search: 3,
} as const;
