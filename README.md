# Tech radar

Public engineering discoveries from Hacker News, new GitHub projects, official release feeds, engineering news and research papers. React, TypeScript and Tailwind. No generated articles, accounts or analytics.

## Read, save, install

Search and filter by topic, source, kind or date. Switch between For you, Latest and Popular. Open a discovery for source evidence and a short excerpt; the original publisher remains the place to read the article.

Saved, read, dismissed, density and appearance preferences are stored only in your browser. They are not uploaded or available to agents. Clearing browser storage removes them. Different devices have independent collections.

Choose Dark, Light or System. Install through a supported browser’s real install prompt; on iPhone or iPad, use Safari → Share → Add to Home Screen. After the first online visit the app shell and last public feed are available offline. A waiting app update prompts before reloading and preserves reading marks.

Daily alerts are optional. Enabling them explicitly requests browser permission and registers a private Web Push subscription. On iOS, a supported version and installation on the Home Screen are required. Disable daily alerts to revoke the subscription. Browser settings control denied permission. Subscription data is used only for public feed alerts and expires after 30 days without renewal. Push delivery depends on browser and operating system support and is not guaranteed.

## Local build

Node.js 22.14 or newer:

```sh
npm ci
npm run collect
npm test
npm run build
npm run privacy
```

Collection is a CLI, not a database migration. It fetches only predefined public sources and atomically replaces `public/data/feed.json`. Source failures keep last good public items and sanitized health codes. If every source fails, the old snapshot remains unchanged. RSS excerpts are capped at 300 characters with original links.

`dist/` is the static app. No source maps or server credentials are included. Keep all publisher credentials, logs and scheduling configuration outside this repository.

## Hosting

Use an existing Netlify account with this repository’s `netlify.toml`. Configure the production site origin in the server-only environment variable `SITE_ORIGIN`, for example `https://monitoring.szczupak.fr`. Add DNS through your domain provider after deployment verification. Push functions are disabled outside the current published production deploy, using Netlify runtime deploy metadata.

Before configuring daily deployments, verify the account’s actual deployment allowance. A credit-based Free account’s 300 monthly credits cannot cover 30 production deployments at 15 credits each. Do not assume that a legacy Free account has the same limits, and do not automatically change plans.

### Optional Web Push

Server-only function environment variables:

- `VAPID_PUBLIC_KEY`: browser-safe public key, returned by the configuration endpoint.
- `VAPID_PRIVATE_KEY`: secret private signing key.
- `PUSH_DISPATCH_SECRET`: cryptographically random 32-byte base64url secret.
- `SITE_ORIGIN`: exact HTTPS production origin, without a trailing slash.

Generate and store keys privately. Never use `VITE_` variables for secrets. Netlify Blobs must be available for the site; subscriptions live in an encrypted private site-wide store, with strong reads and compare-and-swap writes. There is no listing endpoint. The site has a hard limit of 30 subscriptions and ten new subscriptions per hour.

A private publisher may call `POST /api/push/dispatch` with its bearer secret and no body only after an atomic deploy and HTTP snapshot-version verification. Messages and destination paths are fixed from the bundled public snapshot, not caller input. Dispatch is bounded, leased, and best effort at most once per version. Provider 404/410 responses remove expired records. A notification already in flight may still arrive during disable. No paid push provider is required.

## Public feed and MCP

`GET /data/feed.json` is the plain public API. It contains strict public DTOs and sanitized source health, never browser marks or subscription data.

Connect a Streamable HTTP MCP client to `/mcp`. The official MCP SDK handles initialization, protocol validation, JSON responses, resources and tool calls. The endpoint is stateless and read only:

- `search_news`: `q` (maximum 200 characters), optional topic/kind/source, `limit` (1–50), `offset` (0–5000).
- `list_topics`: generic topic labels.
- `get_item`: a public 24-character item ID.
- `list_sources`: public definitions and health codes.
- Resources: `radar://feed`, `radar://topics`, `radar://sources`.

No tool fetches arbitrary external URLs or supports SQL, files, writes, feedback or subscriptions. Requests are capped at 16 KiB. No authentication is required for the public dataset. See `ARCHITECTURE.md` for trust boundaries and testing limitations.

## Publisher lifecycle

A private scheduled job should lock collection, retain last good snapshots, collect → test → build → privacy scan → atomic deploy → verify deployed version → dispatch alerts. Do not put tokens in command-line arguments, logs or Git. Data snapshots can be deployed without daily Git commits. Enable a production schedule only after privacy review and real deployment QA, while retaining the previous application until verification completes.
