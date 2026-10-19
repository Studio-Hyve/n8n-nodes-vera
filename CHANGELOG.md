# Changelog

## 0.1.0

Initial release.

- Vera API credential (Bearer key) with a free credential test against `GET /v1/usage`.
- Vera node: Scrape Page, Web Search, News Search, Video Search, Extract Contacts, Extract Products.
- Results carry the API JSON plus `credits_used`; failures raise errors with advice, or error items
  with Continue on Fail.
