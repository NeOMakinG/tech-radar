# Architecture

## Trust boundaries

1. **Public source collector:** predefined HTTPS host allowlist, at most 24 requests, 15-second request deadlines, 2 MB per response and 20 MB per run. Redirect destinations are revalidated. Source parsers feed an explicit DTO constructor; they cannot export arbitrary raw fields. No private database is opened.
2. **Public snapshot:** strict schema, versioned SHA-256 integrity, public URLs, dates, topics, observed popularity and evidence. Text is plain and excerpts are capped at 300 characters. Source health has fixed codes instead of upstream exception messages. Failed sources retain only already-validated public records.
3. **Static browser app:** loads `/data/feed.json`; all feedback and preferences remain in local storage. Generic ranking is calculated from public topic-term matches (60%), recency (25%) and observed popularity (15%). Popular uses observed popularity (70%) and recency (30%). Different sources’ popularity units are not directly equivalent and no growth rates are implied. These are heuristic discovery orders, not a personal profile.
4. **Service worker:** content-versioned app precache and last public feed; GET-only same-origin static paths. It never caches push endpoints, POST requests, function endpoints or MCP responses. Waiting workers activate on explicit update choice. Network/cache failures have last-good fallbacks; storage quota failure can prevent offline installation but cannot expose private data.
5. **Read-only MCP function:** official MCP server SDK v2 Web Standard legacy-compatible stateless Streamable HTTP transport with JSON responses. Fresh server and transport per POST. Tool schemas are strict, maximum 50 items per search, 200 query characters and 16 KiB request bodies. No sessions, writes, SQL, files, arbitrary network requests or browser state. GET streams are deliberately not offered.
6. **Optional push functions:** private Netlify Blobs subscription registry, current-published-production runtime context and exact-origin guards, known HTTPS push-provider endpoint allowlist, validated P-256/auth keys and 4 KiB mutation bodies. A per-subscription random revocation capability is returned only on registration and hashed in the registry. Strong read/CAS writes serialize admission, disable and dispatch reservation. No listing interface.

## Push concurrency and delivery

A single bounded registry holds at most 30 subscriptions, expiration timestamps and last-sent public versions. New admissions are capped at ten per hour. A compare-and-swap lease prevents concurrent fanout. Three workers send with absolute fetch deadlines and redirects rejected; dispatch ends within its 40-second work budget plus bounded registry operations. A record reserves its public version before sending: this avoids duplicate notifications when requests overlap or crash, at the cost of best-effort delivery if sending fails. This is intentionally not an exactly-once guarantee; no storage transaction can atomically include an external push service.

Unsubscribe and expiration remove records from strong storage. An already in-flight message can arrive after disable. Browser permissions and delivery remain controlled by the operating system. Background native notification delivery must be verified on the actual hosted site; unit tests or a visible tab notification are not proof.

## Deployment and state

The frontend artifact and function bundles use the same immutable public snapshot. Netlify deploys atomically. A private publisher verifies HTTP snapshot version before dispatching. A failed fetch, test, scan, build or deployment must leave the last successful site unchanged. Secret/environment configuration and cron scripts live outside Git. Account limits must be verified before enabling daily production deployments.

Existing private reading data is not imported. Publication must use a new clean history and a non-personal Git identity. Allowlisted source and artifact manifests, secret scans, by-value scans and independent privacy review precede any upload.

## Tests and receipts

`tests/` covers strict export construction and extra-field canaries, unsafe URLs, bounded excerpts, integrity, push provider SSRF rejection/key validation/capability authorization/caps/expiry, request size/origin boundaries, and an official MCP client’s initialize/tools/resources/errors round trip. Browser QA must additionally cover desktop dark/light/system, mobile overflow, local feedback persistence, filter/search/paper views, actual installation behavior, offline after first load and an app update preserving marks.

A production release additionally requires real Netlify function/Blobs CAS testing, official MCP client tests against the deployed HTTPS URL, HTTP version checks and real background push receipt where platform support permits. Unverified native delivery is a blocker, not a passed test.

## SDK primary references

- MCP transport: https://github.com/modelcontextprotocol/typescript-sdk/blob/v2.3.1/docs/serving/http.md
- MCP schemas: https://github.com/modelcontextprotocol/typescript-sdk/blob/v2.3.1/docs/advanced/schema-libraries.md
- Netlify Blobs: https://docs.netlify.com/build/data-and-storage/netlify-blobs/
- Web Push: https://github.com/web-push-libs/web-push/blob/v3.6.7/README.md
- Hosting allowance: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/
