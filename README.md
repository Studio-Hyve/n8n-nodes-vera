# n8n-nodes-vera

[![CI](https://github.com/Studio-Hyve/n8n-nodes-vera/actions/workflows/ci.yml/badge.svg)](https://github.com/Studio-Hyve/n8n-nodes-vera/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/n8n-nodes-vera)](https://www.npmjs.com/package/n8n-nodes-vera)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

n8n community node for [Vera](https://vera.waggle.ae), the web data and search API from Waggle.
Read any public page as clean Markdown, search the web, news and video, pull contacts and product data
out of a page, read full search results pages on five engines, get keyword ideas, see whether AI
assistants name your brand, run a GEO citation radar and audit a company's search footprint, all from
inside an n8n workflow.

**New to Vera?** [Sign up](https://vera.waggle.ae/signup) for free credits. No card needed.

- [Install](#install)
- [Authentication](#authentication)
- [Operations and credit costs](#operations-and-credit-costs)
- [Examples](#examples)
- [Output](#output)
- [Errors](#errors)
- [Development](#development)
- [Publishing (maintainers)](#publishing-maintainers)

## Install

In a self-hosted n8n: **Settings > Community Nodes > Install**, enter `n8n-nodes-vera`, and accept
the community-node notice. Or install it into your n8n user folder:

```sh
cd ~/.n8n/nodes && npm install n8n-nodes-vera
```

On n8n Cloud, the Vera node appears in the nodes panel once the package has passed n8n's
verification. See the [community nodes guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Authentication

1. [Create a Vera account](https://vera.waggle.ae/signup) (free credits on sign-up) and confirm your
   email.
2. In your Vera workspace, open **API keys** and create a key. It looks like `vera_live_...`. Copy it
   when it appears; Vera stores only a hash, so it cannot be shown again.
3. In n8n, create a **Vera API** credential and paste the key.

Requests go to the direct Vera API at `https://vera.waggle.ae/v1` with
`Authorization: Bearer <key>`. The credential has a **Base URL** field that holds this address; leave it
as it is unless you were given a different one (for example a staging Vera). The key is sent to that
address, so only `https` is accepted (plain `http` only for `localhost`). The website's
`/api/vera` proxy is not used: it does not carry the newer routes and gives up on a long request after
40 seconds.

The credential's **Test** button calls `GET /v1/usage`, which needs a valid key and costs no credits.

## Operations and credit costs

Pick a **Resource**, then an **Operation**. A failed call is not charged.

| Resource | Operation | Credits | What it does |
| --- | --- | --- | --- |
| Page | **Scrape Page** | 1 (5 with **Render JavaScript**) | Reads a public page and returns its main content as Markdown (or the raw HTML), plus text, links and metadata. |
| Page | **Extract Contacts** | 1 | Finds the emails, phone numbers and social links the page publishes. |
| Page | **Extract Products** | 1 | Reads the product data the page publishes (names, identifiers, prices, offers). Optional best-effort marketplace readers for Amazon, Walmart and Shopee. |
| Search | **Web Search** | 3 | Web results for a query, up to 100 rows. |
| Search | **News Search** | 3 | News results for a query. |
| Search | **Video Search** | 3 | Video results for a query. |
| SERP | **Get Results Page** | by result | A full results page on Google, Bing, DuckDuckGo, Brave or Yahoo: organic results and, on Google, the AI Overview, People Also Ask and Knowledge Graph, plus optional map listings and shopping. |
| Keyword | **Get Ideas** | by result | Keyword ideas for a seed from autocomplete, People Also Ask and related searches, each with its sources and an intent label. No search volumes. |
| AI Answer | **Check Brand in AI Answers** | by result, the most expensive | Puts a buyer's question to ChatGPT, Claude or Gemini and tells you whether your brand and competitors are named, in what order, with the citations behind it. |
| GEO Radar | **Run Query Radar** | by result | One query in depth: citation probability (0 to 100), forum threads worth joining, list articles that name your competitors, question gaps and a brief for AI writers. |
| Company | **Get Search Footprint** | by result | How a company shows up in search: its own properties, social and reference profiles, map listings, third-party mentions and brand questions. |

A search costs 3 credits whatever the **Limit** (1 to 100).

**"By result" means priced by what comes back.** Vera works out the most a call can cost and holds that
amount first, you are charged for what was actually served, and the rest is given back. The charge is
in `credits_used` on every item (and in the `X-Waggle-Credits-Used` response header). A results page of
up to ten results is typically 3 credits live and 1 when served from Vera's cache; every further ten
results is another page, and the Local Pack and Shopping add-ons are priced on their own. AI answers are
priced per call to each assistant and cost far more than a search, Claude the most, so start with one
assistant and one sample. On free credits a daily pace also applies to the amount held, so one expensive
call can use up a whole day: a second one the same day answers 429 until midnight UTC.

### Scrape Page

| Field | Notes |
| --- | --- |
| **URL** | Required. A public `http(s)` page. |
| **Format** | **Markdown** (default, `data.markdown`) or **HTML** (`data.html`, up to 2 MB). Text, links and metadata come back either way. |
| **Render JavaScript** | Loads the page in a real browser first, for content built by JavaScript. 5 credits instead of 1. |
| **Fields to Extract** | Up to 10 named CSS-selector rules. Each has a **Name**, a **CSS Selector**, an optional **Attribute** and **Return Multiple**. Results appear under `data.extracted`. Static pages only: not with Render JavaScript or the HTML format. Selectors are one tag, `#id`, `.class` or `[attribute]` selector (for example `h1`, `.price`, `meta[name=description]`); descendant chains and pseudo-classes are not supported. |
| **Options** | **Minimum Quality Score** (refuse a result below 0 to 100, uncharged), **Wait (Ms)** and **Wait For Selector** (with Render JavaScript), **Idempotency Key**. |

### Extract Contacts, Extract Products

Both take a **URL**. Extract Products also has a **Marketplace** choice: **Auto-Detect** (any store that
publishes Product data in its page markup, which works reliably) or Amazon, Walmart or Shopee. The
marketplace readers are best-effort: large marketplaces often block automated requests, so they may
fail, and a failed request costs nothing. They need a full HTTPS product detail URL. If the page
publishes no Product data the call is refused and not charged.

### Web, News and Video Search

**Query** (required, up to 500 characters; quoted phrases and `site:` are kept as written) and **Limit**.
Options: **Country** and **Language** (two lowercase letters, for example `ae`, `ar`) and **Idempotency Key**.

### SERP: Get Results Page

| Field | Notes |
| --- | --- |
| **Engine** | **Google** (default), **Bing**, **DuckDuckGo**, **Brave** or **Yahoo**. |
| **Query** | Required, up to 500 characters. Sent as `q`. |
| **Depth** | How many results to read, 1 to 100 (default 10). Every ten results is one results page, so a larger depth costs more. |
| **Add-Ons** | Google only. **Local Pack (Map Listings)** adds the Google Maps listings (name, rating, address, phone, website); set a **Location** for a local query. **Shopping** adds the shopping carousel. Each is priced on its own, once per request, and only when it returns something. |
| **Options** | **Country** (`gl`), **Language** (`hl`), **Location** (a city or region, for example `Dubai`), **Skip Cache** (search live instead of reusing a result from the last 24 hours; costs the full price), **Idempotency Key**. |

### Keyword: Get Ideas

| Field | Notes |
| --- | --- |
| **Seed** | Required, the keyword to find ideas for, up to 200 characters. Works in Arabic. |
| **Limit** | Max number of ideas, 1 to 200 (default 50). |
| **Expand** | How many autocomplete calls to make: **None** (the seed alone, cheapest), **Questions** (default), **Alphabet** or **All** (the most calls and ideas). More calls cost more; it stops early once the limit is reached. |
| **Options** | **Country**, **Language**, **Location**, **Skip Cache**, **Idempotency Key**. |

### AI Answer: Check Brand in AI Answers

| Field | Notes |
| --- | --- |
| **Question** | Required, the question to ask, as a buyer would, up to 1,000 characters. |
| **Brand** | Required, the brand name to look for in the answers. |
| **Brand Domain** | The brand's website, for example `roasters.ae`. Lets Vera tell whether your site was cited. |
| **Competitors** | Names or domains, separated by commas, up to 20. They give you the share of voice. |
| **Assistants** | **ChatGPT** (default), **Claude** or **Gemini**. Each one is a separate paid call. At least one must be chosen: an empty list is refused, because the API would ask every assistant. The API also accepts `perplexity` when it is set up; use an expression to send it. An assistant that is not set up answers `not_configured` and costs nothing. |
| **Samples** | 1 to 5 (default 1). Asks each assistant the same question more than once, for a mention rate. Each sample is a paid call. |
| **Options** | **Country** and **Language** of the market (`ae` and `en` when left out), **City**, **Idempotency Key**. |

This call can take up to about 150 seconds. The node waits up to 175 seconds for it (the other search
tools wait 50 to 80 seconds, page and search calls 60).

### GEO Radar: Run Query Radar

**Query** (required), **Brand**, **Domain** and **Depth** (organic results read, 1 to 100, default 30).
Options: **Country**, **Language**, **Location**, **Skip Cache**, **Idempotency Key**. Use it to
see how likely AI answers are to cite your brand for one topic, which forum threads to join and which
list articles name your competitors.

### Company: Get Search Footprint

**Company** (required), **Domain** and **Depth** (1 to 100, default 20). Options: **Country**,
**Language**, **Location**, **Skip Cache**, **Idempotency Key**. It separates the company's own web
properties, its social and reference profiles (Wikipedia, LinkedIn, Instagram, Crunchbase), its map
listings, what third parties say and the questions people ask about the brand.

> **Defaults for the radar, the footprint and AI answers.** If you leave **Location** and **Country** out,
> the API currently uses Dubai and `ae`. Set them for any other market.

### Idempotency Key

Set it on any operation to protect a retried call. Repeating the same key and request within 24 hours
returns the first result without charging again (the item then carries `idempotency_replayed: true`).
A failed call is replayed too, so retry a failed call with a new key. 16 to 128 letters, digits,
underscores, dots, colons or hyphens. Build one per item, for example
`workflow-run-{{ $execution.id }}-item-{{ $itemIndex }}`.

## Examples

**Rank check with local listings** (SERP > Get Results Page): Engine `Google`, Query `coffee shop`,
Add-Ons `Local Pack`, Options > Location `Dubai`, Country `ae`. Each item has `data.organic` (ranked
results) and `data.serp_features.local_pack` (the map listings).

**Keyword research** (Keyword > Get Ideas): Seed `specialty coffee`, Expand `Questions`, Options >
Country `ae`. Add a **Split Out** node on `data.ideas` to get one item per idea, each with `keyword`,
`sources` and `intent`.

**Is my brand in the answer?** (AI Answer > Check Brand in AI Answers): Question `What are the best
specialty coffee roasters in Dubai?`, Brand `Roasters`, Brand Domain `roasters.ae`, Competitors
`Other Roasters`, Assistants `ChatGPT`. Read `data.engines[0].aggregate` for the mention rate and share
of voice, and `data.engines[0].samples[].citations` for the pages the assistant cited. Schedule it
daily to track visibility.

## Output

One item per input item, with the API's JSON plus the credits used:

```json
{
  "request_id": "req_...",
  "data": {
    "url": "https://example.com/",
    "title": "Example Domain",
    "markdown": "# Example Domain\n...",
    "text": "...",
    "links": [],
    "metadata": {},
    "extracted": { "price": "$19" }
  },
  "credits_used": 1,
  "elapsed_ms": 412
}
```

`credits_used` is what that call was charged (from the `X-Waggle-Credits-Used` header; 0 on an
idempotent replay). Searches return rows under `data.results`; use a **Split Out** node on that field to
get one item per result. Contacts come back under `data.emails`, `data.phones` and `data.socials`,
products under `data.products`.

The search tools return the search service's JSON under `data`, unchanged:

| Operation | Main fields in `data` |
| --- | --- |
| Get Results Page | `organic` (position, title, link, snippet, domain, classification), `serp_features` (`ai_overview`, `people_also_ask`, `knowledge_graph`, `local_pack`, `shopping`...), `llm_markdown` (a compact brief), `provenance` (including `cache_hit`) |
| Get Ideas | `ideas` (keyword, sources, intent), `count`, `status`, `notes` |
| Check Brand in AI Answers | `engines` (per assistant: `status`, `aggregate` with mention rate and share of voice, `samples` with citations), `notes` |
| Run Query Radar | `citation_probability_score`, `brand_visibility`, `community_injection_targets`, `listicle_outreach_targets`, `aeo_question_gaps`, `llm_markdown` |
| Get Search Footprint | `owned_properties`, `social_and_entity_profiles`, `local_pack_locations`, `third_party_mentions`, `brand_questions`, `reputation_summary`, `llm_markdown` |

## Errors

The node raises an error with advice you can act on. Turn on **Continue on Fail** to get an error item
instead (`error`, `description`, `status_code`, and `retry_after_seconds` or `request_id` when known).

| Status | Meaning |
| --- | --- |
| 401 | Missing, invalid, expired or revoked key. Update the credential. |
| 402 | Not enough credits. Top up or pick a plan at <https://vera.waggle.ae/pricing>. |
| 403 | The account needs an action first, such as confirming the email address. |
| 409, 410 | An idempotency key was reused with a different request, or its request is still running. |
| 400, 422 | Invalid input. The message names the field the API refused (or, for a page, why it could not be read, for example robots.txt disallows it). Not charged. The `code` field names failed fetches. |
| 429 | Rate limit, or the free-credit daily pace. `retry_after_seconds` says when to try again. |
| 502, 503 | Temporarily unavailable. Not charged. Try again shortly (a 503 says how long). |
| 504 | Vera timed out waiting for the service behind the tool. Not charged. Try again, or ask for less: a smaller Depth, fewer Samples or one assistant. |

## Development

```sh
npm install
npm run lint        # n8n's eslint rules, including the n8n Cloud eligibility checks
npm run build       # tsc plus static files, into dist/
npm test            # vitest, HTTP mocked
npm run typecheck   # type-checks the source and the tests
npm run dev         # n8n with this node loaded (needs Docker or Podman; see the n8n docs)
```

The tests mock n8n's HTTP helper, so they never reach the network or spend credits. A contract test
(`test/contract.test.ts`) checks every request body this node builds against a snapshot of Vera's
published OpenAPI request schemas and example bodies (`test/fixtures`), refreshed from
<https://vera.waggle.ae/v1/openapi.json>.

### How the fields map to the API

| Node field | API field |
| --- | --- |
| Format: Markdown | `response_format: "markdown"` |
| Format: HTML | `return_html: true` |
| Render JavaScript | `render: true` |
| Fields to Extract | `extract: { name: { selector, attribute?, multiple? } }` |
| Minimum Quality Score | `min_quality_score` |
| Wait (Ms), Wait For Selector | `wait_ms`, `wait_for` |
| Marketplace | `marketplace` |
| Limit, Country, Language (Search) | `limit`, `country`, `language` |
| SERP: Engine, Query, Depth | path `/serp/{engine}`, `q`, `depth` |
| SERP: Add-Ons | `features: ["organic", "paa", "ai_overview", ...add-ons]` |
| SERP, Keyword, Radar, Company: Country, Language, Location | `gl`, `hl`, `location` |
| AI Answer: Country, Language, City | `country`, `language`, `city` |
| Skip Cache | `fresh: true` |
| Keyword: Seed, Limit, Expand | `seed`, `limit`, `expand` |
| AI Answer: Question, Brand, Brand Domain, Competitors, Assistants, Samples | `prompt`, `brand`, `brand_domain`, `competitors`, `engines`, `samples` |
| Radar: Query, Brand, Domain, Depth | `query`, `brand`, `domain`, `depth` |
| Company: Company, Domain, Depth | `company`, `domain`, `depth` |
| Idempotency Key | `Idempotency-Key` header |

## Publishing (maintainers)

The repository is <https://github.com/Studio-Hyve/n8n-nodes-vera>. npm provenance refuses a package
whose `repository.url` does not match the repository that builds it, so keep `package.json` pointing
there.

### Verified node (needed for n8n Cloud)

Since 1 May 2026 n8n only verifies community nodes published from a GitHub Actions workflow with an npm
provenance statement, not from a laptop. This repository ships that workflow
(`.github/workflows/publish.yml`).

1. Create an empty public GitHub repository named `n8n-nodes-vera` in the Studio-Hyve organisation
   (no README, licence or `.gitignore`), then push this one to it:

   ```sh
   git remote add origin git@github.com:Studio-Hyve/n8n-nodes-vera.git
   git push -u origin main
   ```

2. Give the workflow permission to publish, either of:
   - **Trusted Publisher** (no stored secret): on npmjs.com, open the package's settings, then
     **Trusted Publishers > GitHub Actions**, with repository owner `Studio-Hyve`, repository
     `n8n-nodes-vera` and workflow `publish.yml`. (npm lets you add it once the package exists, so if
     npm will not accept it before a first release, use the token below for that first release.)
   - **Token**: on npmjs.com create a Granular Access Token with read and write access to this package
     and save it as the GitHub Actions secret `NPM_TOKEN`.
3. Release. This lints, builds, asks for the version bump, updates `CHANGELOG.md`, commits, tags and
   pushes; the pushed tag triggers `publish.yml`, which publishes with provenance:

   ```sh
   npm login
   npm run release
   ```

4. Submit the published package for verification in the
   [n8n Creator Portal](https://creators.n8n.io/nodes). n8n checks that `npm run lint` passes, that
   there are no runtime dependencies, and the UX and documentation guidelines.

### Quick publish (self-hosted n8n only, not eligible for verification)

`prepublishOnly` blocks a bare `npm publish` on purpose, to steer you to `npm run release`. To publish
once from your machine anyway:

```sh
npm login
npm run lint && npm run build && npm test
npm publish --ignore-scripts          # add --otp=<code> if your npm account uses 2FA
```

Anyone can then install it with **Settings > Community Nodes** on a self-hosted n8n. n8n will not verify
a package published this way, so it will not reach n8n Cloud.

## Licence

[MIT](LICENSE)
