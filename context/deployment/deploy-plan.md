---
project: ChickenDinner
deployed_at: 2026-05-26T22:00:00Z
platform: Cloudflare Workers
worker_name: 10x-astro-starter
live_url: https://10x-astro-starter.mikolaj-chmielewski.workers.dev
version_id: 694b157e-792f-4bac-9b18-2bf0528b4bb1
latest_ci_version_id: 2ec5a9f0-2467-45d6-938e-e33bfc2b441d
sources:
  - context/foundation/infrastructure.md
  - context/foundation/tech-stack.md
status: deployed
secrets_set:
  - SUPABASE_URL
  - SUPABASE_KEY
github_secrets_set:
  - CLOUDFLARE_API_TOKEN
  - CLOUDFLARE_ACCOUNT_ID
  - SUPABASE_URL
  - SUPABASE_KEY
deferred: []
---

## What was deployed

First production deploy of ChickenDinner to Cloudflare Workers, following the platform decision in `context/foundation/infrastructure.md`. The Worker is live at the URL above; the home page, sign-in page, and middleware-protected `/dashboard` redirect all verified working on the live URL.

**Supabase is fully wired and verified end-to-end** (cloud project provisioned by the developer, anon URL + key set as Workers Secrets via `wrangler secret put`, signup + email confirmation + signin + protected route access all tested on the live URL). The missing-config banner is no longer shown.

## Configuration change applied

One mandatory edit to `wrangler.jsonc` before first deploy — adding `disable_nodejs_process_v2` to `compatibility_flags`. From the `infrastructure.md` Risk Register row 1 (H/H):

```jsonc
// before
"compatibility_flags": ["nodejs_compat"],

// after
"compatibility_flags": ["nodejs_compat", "disable_nodejs_process_v2"],
```

Without this flag, `compatibility_date: "2026-05-08"` + `nodejs_compat` + middleware in `src/middleware.ts` would have caused every SSR page to render `[object Object]` in production. Local `wrangler dev` did NOT replicate the bug — verification had to happen on the live URL.

No other source files were modified during this deploy.

## Commands executed

```bash
# A2. Local verification
npm run dev
# verified /dashboard redirects to /auth/signin (not [object Object])

# C1. Cloudflare auth (browser OAuth, one-time)
npx wrangler login
# scope: account:read user:read workers:write workers_kv:write workers_routes:write
#        workers_scripts:write workers_tail:read d1:write pages:write ...

# C2. Build
npm run build
# output: dist/ via @astrojs/cloudflare adapter
# warning (non-blocking): [@astrojs/sitemap] requires `site` in astro.config.mjs

# C3. Deploy
npx wrangler deploy
# Worker uploaded: 1921.70 KiB total / gzip 393.40 KiB
# auto-provisioned: SESSION KV namespace (4220a8dc1d8e4e579935e03f37474d44)
# bindings: SESSION (KV), IMAGES, ASSETS
# Worker startup time: 25 ms
# version: 694b157e-792f-4bac-9b18-2bf0528b4bb1
# url: https://10x-astro-starter.mikolaj-chmielewski.workers.dev

# C5. Smoke-test tail (background)
npx wrangler tail --status error --format pretty
# Connected, expires 2026-05-27T01:59:05Z, no errors during smoke traffic
```

## Verification results

| Check | Expected | Actual | Pass |
|---|---|---|---|
| `npx wrangler deploy` exit code | 0 | 0 | ✅ |
| Live URL printed | `*.workers.dev` | `10x-astro-starter.mikolaj-chmielewski.workers.dev` | ✅ |
| Bundle size vs free-tier 3 MB limit | < 3 MB | 1.88 MB | ✅ |
| `GET /` | 200, missing-config banner present | 200, `banner--error` div in HTML | ✅ |
| `GET /dashboard` | 302 → `/auth/signin` | 302 → `https://…/auth/signin` | ✅ |
| `GET /auth/signin` | 200, form mounts | 200, `<form>` with `type="email"` + `type="password"` | ✅ |
| `[object Object]` in `/` body | 0 occurrences | 0 | ✅ |
| `[object Object]` in `/auth/signin` body | 0 occurrences | 0 | ✅ |
| `wrangler tail --status error` during smoke | clean | clean | ✅ |

## State of secrets

**Workers Secrets currently set** (verified via `npx wrangler secret list`):
- `SUPABASE_URL` — Project URL of the cloud Supabase project (set 2026-05-26)
- `SUPABASE_KEY` — anon public key of the same project (set 2026-05-26)

Both are `type: secret_text`, encrypted at rest by Cloudflare. Values are NOT recoverable from CLI — to rotate, generate a new value in Supabase dashboard first, then `npx wrangler secret put <NAME>` to overwrite. `wrangler secret put` automatically bumps the Worker version, so secrets take effect within seconds without a separate `wrangler deploy`.

**GitHub Actions secrets:** N/A — repo has no GitHub remote yet. See "Enabling CI auto-deploy later" below.

## Supabase setup — what was done (2026-05-26)

The walkthrough that landed the secrets, for future reference / rotation:

1. **Cloud project created** at supabase.com (region: EU; free tier; project name: `chicken-dinner`). Database password saved separately by developer (not stored in this repo). "Automatically expose new tables" left at default ON — safe because every new table must have RLS enabled with `auth.uid() = user_id`-shaped policies per CLAUDE.md.
2. **URL + anon key copied** from Supabase dashboard → Project Settings → API. The `service_role` key was deliberately NOT used (it bypasses RLS and would have made every user an admin).
3. **Secrets set** as Workers Secrets (NOT Pages secrets — `infrastructure.md` Risk Register row 3):
   ```bash
   npx wrangler secret put SUPABASE_URL  # pasted Project URL
   npx wrangler secret put SUPABASE_KEY  # pasted anon public key
   ```
   `wrangler secret put` automatically bumped the Worker version — no separate `wrangler deploy` was needed.
4. **End-to-end verification on live URL**: signup → email confirmation → signin → `/dashboard` rendered (no redirect) → signout → `/dashboard` redirects to `/auth/signin` again. All passed.

**To rotate a secret** (e.g., compromised anon key): generate replacement in Supabase dashboard → Settings → API first, then `npx wrangler secret put SUPABASE_KEY` to overwrite. The new value takes effect within seconds.

## Enabling CI auto-deploy later

When a GitHub remote exists and you want every push to `main` to trigger a deploy:

1. **Push the repo to GitHub** (creates the remote — currently absent):
   ```bash
   gh repo create chicken-dinner --private --source=. --push
   ```

2. **Generate a Cloudflare API token** at dash.cloudflare.com → My Profile → API Tokens → Create Token. Use the "Edit Cloudflare Workers" template OR a custom token with `Account: Workers Scripts: Edit`. Copy the token.

3. **Find your Cloudflare Account ID** at dash.cloudflare.com (right sidebar on the Workers & Pages page).

4. **Add GitHub repo secrets** (`gh secret set` or via the GitHub web UI under Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN` — the token from step 2
   - `CLOUDFLARE_ACCOUNT_ID` — the ID from step 3
   - `SUPABASE_URL` — same value as the Worker secret
   - `SUPABASE_KEY` — same value as the Worker secret

5. **Update `.github/workflows/ci.yml`:**
   - Change `branches: [master]` → `branches: [main]` on **both** `push` and `pull_request` triggers (CLAUDE.md tripwire — current workflow is dead on the `main` branch).
   - Append a deploy step that only runs on push to `main` (not on PRs):
     ```yaml
           - run: npx wrangler deploy
             if: github.event_name == 'push' && github.ref == 'refs/heads/main'
             env:
               CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
               CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
     ```

6. **Push a small change to `main`** and confirm the workflow runs both `build` and `deploy` jobs, and that the live URL reflects the change.

## Known issues / follow-ups

- **`@astrojs/sitemap` warning** during build: `The Sitemap integration requires the site astro.config option. Skipping.` Sitemap is not generated. Fix later by adding `site: "https://10x-astro-starter.mikolaj-chmielewski.workers.dev"` (or a custom domain) to `astro.config.mjs`.
- **Stale `tech-stack.md` field**: `hints.deployment_target: cloudflare-pages` — the actual deployment is Workers. Canonical fix per CLAUDE.md is re-running `/10x-tech-stack-selector`, not hand-editing the foundation artifact. Cosmetic only — `wrangler.jsonc` and `infrastructure.md` are authoritative.
- **`@astrojs/cloudflare` floating version** (`^13.5.0` in `package.json`): pin to `13.5.0` after a few stable deploys to avoid unexpected adapter behavior changes (per `infrastructure.md` Unknown Unknowns).
- **Free-tier 10 ms CPU limit**: not pre-deploy actionable. Watch for 429s; budget $5/mo for Workers paid plan if SSR pages hit the ceiling under real traffic (Risk Register row 2).
- **Wrangler `4.94.0 → 4.95.0` update available**: not blocking.
- **GitHub Actions Node.js 20 deprecation**: `actions/checkout@v4` and `actions/setup-node@v4` must be bumped to Node.js 24-compatible versions before **2026-06-02** (forced default) or CI will fail. Tracked via scheduled routine `trig_01QCj1f2g4i3wqAwqKQZ7UE1` (fires 2026-05-30 09:00 Warsaw). Connect GitHub at https://claude.ai/code/onboarding?magic=github-app-setup before that date for the routine to push the change automatically.

## Rollback

If a future deploy needs to be rolled back to this version:

```bash
npx wrangler rollback 694b157e-792f-4bac-9b18-2bf0528b4bb1
# propagates globally in 30–60 seconds
```

Note: Cloudflare retains the last 100 versions. Any Supabase schema migration applied between this version and the future one must be reverted separately (`supabase db push` against a reverted migration), per `infrastructure.md` Operational Story → Rollback.

## Operational references

- **Live logs**: `npx wrangler tail` (live) or `npx wrangler tail --status error` (errors only).
- **MCP observability** (when set up): `observability.mcp.cloudflare.com/mcp` — structured log queries via MCP, per `infrastructure.md`.
- **Dashboard**: dash.cloudflare.com → Workers & Pages → `10x-astro-starter`.
- **Secrets management**: `npx wrangler secret list`, `npx wrangler secret put <NAME>`, `npx wrangler secret delete <NAME>`.
