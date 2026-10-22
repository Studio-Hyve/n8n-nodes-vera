# Changelog

## 0.1.0

Initial release.

- **Vera API credential**: a Bearer key, a **Base URL** field (default `https://vera.waggle.ae/v1`, the
  direct API; the website's `/api/vera` proxy lacks the newer routes and cuts a request at 40 s) and a
  free credential test against `GET /v1/usage`.
- **Page**: Scrape Page, Extract Contacts, Extract Products (marketplace readers are best-effort).
- **Search**: Web Search, News Search, Video Search.
- **SERP**: Get Results Page on Google, Bing, DuckDuckGo, Brave or Yahoo (`POST /v1/serp/{engine}`),
  with depth, country, language, location, cache control and the Google Local Pack and Shopping
  add-ons.
- **Keyword**: Get Ideas (`POST /v1/keywords/ideas`), with limit, expansion, country, language and
  location.
- **AI Answer**: Check Brand in AI Answers (`POST /v1/ai/answers`) on ChatGPT, Claude or Gemini, with
  brand domain, competitors, samples, country, language and city. One assistant and one sample by
  default; an empty assistant list is refused so it can never ask them all.
- **GEO Radar**: Run Query Radar (`POST /v1/geo/radar/query`).
- **Company**: Get Search Footprint (`POST /v1/company/footprint`).
- Results carry the API JSON plus `credits_used` (the `X-Waggle-Credits-Used` header is the authority).
  The search tools are priced by what comes back.
- Each long operation waits long enough for the API: 50 s for a results page, 80 s for keyword ideas and
  the radar, 65 s for a company footprint and 175 s for AI answers (the API takes up to about 150 s).
- Failures raise errors with advice, or error items with Continue on Fail: 402 out of credits with a
  link to pricing, 400 and 422 invalid input with the API's message, 429 with the wait, 503
  temporarily unavailable and 504 timed out (both not charged).
