/** Production base URL of the Vera API. */
export const VERA_BASE_URL = 'https://vera.waggle.ae/api/vera/v1';

/** Response header that reports the credits a call used (lower-cased, as n8n exposes headers). */
export const CREDITS_HEADER = 'x-waggle-credits-used';

/** Response header with the request id, for support and the Activity view. */
export const REQUEST_ID_HEADER = 'x-waggle-request-id';

/** Retry-After, in seconds, on 429 and some 409 answers. */
export const RETRY_AFTER_HEADER = 'retry-after';

/** Per-request client timeout. Rendered pages can take a while; the API caps a call itself. */
export const REQUEST_TIMEOUT_MS = 60_000;

/** Search returns at most this many rows per call (the schema accepts more but serves 100). */
export const SEARCH_MAX_RESULTS = 100;

/** The API accepts at most this many extraction fields on one scrape. */
export const MAX_EXTRACT_FIELDS = 10;

/** Credits per call, from GET /portal/capabilities. Rendering replaces the 1 credit page cost. */
export const CREDITS = {
	page: 1,
	renderedPage: 5,
	contacts: 1,
	products: 1,
	search: 3,
} as const;
