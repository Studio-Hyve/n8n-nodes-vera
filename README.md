# n8n-nodes-vera

n8n community node for [Vera](https://vera.waggle.ae), the web-scraping and search API from Waggle.
Read any public page as clean Markdown, search the web, news and video, and pull contacts and
product data out of a page, from inside an n8n workflow.

**New to Vera?** [Sign up free](https://vera.waggle.ae/signup) and get 3,000 credits. No card needed.

- [Install](#install)
- [Authentication](#authentication)
- [Operations and credit costs](#operations-and-credit-costs)
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

1. [Create a free Vera account](https://vera.waggle.ae/signup) and confirm your email.
2. In your Vera workspace, open **API keys** and create a key. It looks like `vera_live_...`. Copy it
   when it appears; Vera stores only a hash, so it cannot be shown again.
3. In n8n, create a **Vera API** credential and paste the key.

The credential's **Test** button calls `GET /v1/usage`, which needs a valid key and costs no credits.
Requests go to `https://vera.waggle.ae/api/vera/v1` with `Authorization: Bearer <key>`.

## Operations and credit costs

Pick a **Resource**, then an **Operation**. A failed call is not charged.

| Resource | Operation | Credits | What it does |
| --- | --- | --- | --- |
| Page | **Scrape Page** | 1 (5 with **Render JavaScript**) | Reads a public page and returns its main content as Markdown (or the raw HTML), plus text, links and metadata. |
| Page | **Extract Contacts** | 1 | Finds the emails, phone numbers and social links the page publishes. |
| Page | **Extract Products** | 1 | Reads the product data the page publishes (names, identifiers, prices, offers). Optional marketplace readers for Amazon, Walmart and Shopee. |
| Search | **Web Search** | 3 | Web results for a query, up to 100 rows. |
| Search | **News Search** | 3 | News results for a query. |
| Search | **Video Search** | 3 | Video results for a query. |

A search costs 3 credits whatever the **Limit** (1 to 100).

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
publishes Product data in its page markup) or Amazon, Walmart or Shopee, which need a full HTTPS
product detail URL. If the page publishes no Product data the call is refused and not charged.

### Web, News and Video Search

**Query** (required, up to 500 characters; quoted phrases and `site:` are kept as written) and **Limit**.
Options: **Country** and **Language** (two lowercase letters, for example `ae`, `ar`) and **Idempotency Key**.

### Idempotency Key

Set it on any operation to protect a retried call. Repeating the same key and request within 24 hours
returns the first result without charging again (the item then carries `idempotency_replayed: true`).
16 to 128 letters, digits, underscores, dots, colons or hyphens. Build one per item, for example
`workflow-run-{{ $execution.id }}-item-{{ $itemIndex }}`.

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

## Errors

The node raises an error with advice you can act on. Turn on **Continue on Fail** to get an error item
instead (`error`, `description`, `status_code`, and `retry_after_seconds` or `request_id` when known).

| Status | Meaning |
| --- | --- |
| 401 | Missing, invalid, expired or revoked key. Update the credential. |
| 402 | Not enough credits. Top up or pick a plan at <https://vera.waggle.ae/pricing>. |
| 403 | The account needs an action first, such as confirming the email address. |
| 409, 410 | An idempotency key was reused with a different request, or its request is still running. |
| 422 | The request or the page could not be processed (for example robots.txt disallows it). The `code` field names failed fetches. |
| 429 | Rate limit. `retry_after_seconds` says when to try again. |
| 502, 503 | Temporarily unavailable. Try again shortly. |

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
published OpenAPI request schemas (`test/fixtures`), refreshed from
<https://vera.waggle.ae/api/vera/v1/openapi.json>.

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
| Limit, Country, Language | `limit`, `country`, `language` |
| Idempotency Key | `Idempotency-Key` header |

## Publishing (maintainers)

Replace `OWNER` in `package.json` (`repository.url`, `bugs.url`) with the GitHub account or
organisation that will host this repository. npm provenance refuses a package whose
`repository.url` does not match the repository that builds it.

### Verified node (needed for n8n Cloud)

Since 1 May 2026 n8n only verifies community nodes published from a GitHub Actions workflow with an npm
provenance statement, not from a laptop. This repository ships that workflow
(`.github/workflows/publish.yml`).

1. Create an empty public GitHub repository named `n8n-nodes-vera`, then push this one to it:

   ```sh
   git remote add origin git@github.com:OWNER/n8n-nodes-vera.git
   git push -u origin main
   ```

2. Give the workflow permission to publish, either of:
   - **Trusted Publisher** (no stored secret): on npmjs.com, open the package's settings, then
     **Trusted Publishers > GitHub Actions**, with your repository owner, repository
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
