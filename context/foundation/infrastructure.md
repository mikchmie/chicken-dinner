---
project: ChickenDinner
researched_at: 2026-05-26T00:00:00Z
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19
  runtime: Cloudflare Workers (workerd / V8 isolates)
  database: Supabase (external, PostgreSQL)
  adapter: "@astrojs/cloudflare"
---

## Recommendation

**Deploy on Cloudflare Workers.**

The stack was bootstrapped with `@astrojs/cloudflare` and `wrangler` already wired — deploying to Cloudflare Workers requires zero adapter changes, zero runtime-compatibility work, and zero cost at MVP traffic levels (the free tier's 100k requests/day covers the entire expected load). Cloudflare scored 10/10 across all five agent-friendly criteria: `wrangler` is the most mature CLI in the candidate pool, 16 official MCP servers are GA, `llms.txt` and per-page `.md` docs are available, and `wrangler deploy` is a deterministic one-command deploy. The interview confirmed stateless request/response (no persistent-connection filter), single-region reach (no edge-native preference required), and external Supabase (no co-location preference). With those constraints, the native stack advantage compounds into a decisive lead.

---

## Platform Comparison

Scored against the five agent-friendly criteria (Pass = 2 / Partial = 1 / Fail = 0). Researched 2026-05-26.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP/Integration | **Total** |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **10** |
| **Vercel** | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | 🔶 Partial | **9** |
| **Netlify** | 🔶 Partial | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **9** |
| **Render** | 🔶 Partial | 🔶 Partial | ✅ Pass | ✅ Pass | ✅ Pass | **8** |
| **Railway** | 🔶 Partial | 🔶 Partial | ✅ Pass | ✅ Pass | 🔶 Partial | **7** |
| **Fly.io** | 🔶 Partial | 🔶 Partial | 🔶 Partial | ✅ Pass | 🔶 Partial | **6** |

**Scoring notes:**

- **CLI-first**: Cloudflare and Vercel earn full marks — `wrangler rollback <version-id>` and `vercel rollback` are both scriptable CLI commands. Netlify, Railway, and Render all lack a dedicated CLI rollback command (dashboard/API only). Fly.io's rollback is manual image redeployment. 
- **Managed/Serverless**: Cloudflare, Vercel, and Netlify are pure serverless/edge — no OS, no container management. Render, Railway, and Fly.io are container-based PaaS with more operational surface.
- **Agent-readable docs**: Cloudflare (`llms.txt` + `llms-full.txt` + per-page `.md`), Vercel (`llms-full.txt`), Netlify (`docs.netlify.com/llms.txt`), Render (`llms.txt` + per-page `.md`), and Railway (`llms.txt` + single-file LLM markdown) all pass. Fly.io has GitHub-hosted Markdown docs but no `llms.txt` — partial.
- **Stable deploy API**: All six platforms pass — each has a deterministic one-command deploy with structured output and predictable exit codes.
- **MCP/Integration**: Cloudflare (16 GA MCP servers), Netlify (GA since 2025-06), and Render (GA since ~Aug 2025) pass. Vercel MCP is Public Beta (2025-08-04). Railway MCP is beta/active development. Fly.io MCP is experimental (`fly mcp server`).

**Why Netlify dropped to #3 despite tying Vercel at 9:** Active adapter bugs in `@astrojs/netlify` v6.5.x (open GitHub issues #14087, #14099, #14218 as of 2026-05-26) and a 50 MB function bundle limit create real deployment risk for this stack. Vercel is ranked #2 as runner-up.

**Why Railway was ranked below Render at #7:** Five major platform outages between November 2025 and May 2026, including an 8-hour GCP-caused outage on 2026-05-19/20 where Google Cloud suspended Railway's production account, cascading to all customer workloads. For a solo MVP this is acceptable with proper status monitoring, but it drops Railway below a more stable alternative.

---

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

The stack is already wired for this platform — `@astrojs/cloudflare` adapter, `wrangler.jsonc`, `nodejs_compat` flag, and the `output: "server"` config are all present. Deploying is `npx wrangler deploy`. The free tier (100k requests/day) comfortably covers all MVP traffic. The `wrangler` CLI is fully scriptable with deterministic exit codes; `wrangler rollback <version-id>` allows programmatic rollback from the last 100 versions. Cloudflare publishes 16 GA MCP servers covering Workers Bindings, Builds, and Observability. Docs are available as `llms.txt`, `llms-full.txt`, and per-page `.md` appends. One active bug (`nodejs_compat` + middleware → `disable_nodejs_process_v2` workaround) is documented with a one-line fix — see Risk Register.

#### 2. Vercel

Strong second choice. `@astrojs/vercel` adapter is GA with active maintenance, switching from `@astrojs/cloudflare` requires only an adapter swap and removal of `wrangler.jsonc`. The Vercel CLI covers the full deploy lifecycle including rollback. Supabase is a first-class Vercel Marketplace partner (`vercel install supabase` auto-injects credentials). MCP is in Public Beta (launched 2025-08-04, `mcp.vercel.com`). Main limitation: Hobby plan is **non-commercial personal use only** — if the app ever monetizes, the Pro plan ($20/user/month) is required. Vercel KV and Vercel Postgres were deprecated; this project already uses external Supabase, so no impact. Cold starts exist (AWS Lambda under the hood), mitigated by Fluid Compute.

#### 3. Render

Simplest Node.js PaaS path. `@astrojs/node` adapter, Node.js 22 Docker container, always-on processes, no cold starts on paid tiers. Render MCP is GA (`mcp.render.com`), covering service management, log retrieval, and metrics. The free tier has a fatal flaw for SSR: 30–60 second spin-up after 15 minutes of inactivity, making it unsuitable for production. The Starter plan ($7/month) eliminates spin-down. Rollback is dashboard/API only (no CLI command; API rollback doesn't disable autodeploys — a gotcha). No CDN/edge distribution; single-region. A viable option if Cloudflare's workerd runtime causes recurring compatibility issues.

---

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **`nodejs_compat` + middleware rendering bug is present in this exact repo.** `wrangler.jsonc` confirms `compatibility_date: "2026-05-08"` and `compatibility_flags: ["nodejs_compat"]` but does **not** include `disable_nodejs_process_v2`. With `compatibility_date ≥ 2025-09-15` and `nodejs_compat`, Astro v6 SSR middleware renders `[object Object]` instead of page content in production. The upstream Astro issue (#15434) was closed as "not planned." The fix is a one-line addition to `wrangler.jsonc`, but if not applied before first deploy, production will be broken in a non-obvious way.

2. **Free-tier 10 ms CPU limit is mismatched with SSR workloads.** The 10 ms CPU ceiling measures V8 isolate CPU time per invocation — not wall-clock time. An Astro SSR page that verifies a Supabase session cookie, runs a database query, and renders React components may consistently exceed this. The developer will encounter unexpected 429/CPU-exceeded errors at real traffic without warning. Upgrading to the paid plan ($5/month) raises the limit to 30s per invocation, but this cost was not modeled in the initial planning.

3. **Workers vs. Pages ambiguity — `tech-stack.md` says `cloudflare-pages` but the repo is wired as Workers.** Deployment commands (`wrangler deploy` vs. `wrangler pages deploy`), secrets management (`wrangler secret put` vs. Pages dashboard), and pricing models differ between the two products. The repo uses Workers correctly (confirmed via `wrangler.jsonc`), but course materials referencing "Cloudflare Pages" will point to documentation for a different product, creating confusion during first deploy and secrets rotation.

4. **`compatibility_date` bumps introduce breaking changes with no safe pause.** Every future bump to `compatibility_date` (required to access security fixes and new features) can silently change runtime behavior. There is no official deprecation window guarantee. The `disable_nodejs_process_v2` fix is one example; similar gaps can appear at future dates. Each bump requires auditing the Cloudflare compatibility changelog.

5. **Vendor lock-in deepens with each Cloudflare primitive added.** The adapter already locks runtime to workerd V8 isolates. If D1, KV, or R2 bindings are added in future features, migrating to any Node.js-based platform requires swapping the adapter AND auditing all bindings. The first deploy is simple; the cumulative migration cost grows.

### Pre-Mortem — How This Could Fail

*Six months after deploying ChickenDinner to Cloudflare Workers, the developer has spent more time debugging platform behavior than shipping features.*

The failure began at first deploy. The `disable_nodejs_process_v2` compatibility flag was missing from `wrangler.jsonc` — the local `wrangler dev` server worked correctly (Miniflare doesn't replicate this exact bug), but production rendered `[object Object]` for every page with middleware. Diagnosing the issue consumed a weekend, eventually resolved by a GitHub comment thread on a closed Astro issue.

With the flag fixed, the next surprise came at first real-user session: the recipe-list page, fetching from Supabase and rendering 20+ recipe cards, intermittently hit the free-tier 10 ms CPU ceiling. The errors appeared as HTTP 429s with no clear explanation in the dashboard. The developer upgraded to the paid plan ($5/month) to resolve it, but the billing model — CPU-milliseconds, not requests — was never part of the mental model.

The third problem was subtler: the course materials referenced `wrangler pages` commands, but the repo was wired as Workers. After rotating `SUPABASE_KEY` via `wrangler secret put`, the developer also set it in the Pages dashboard (thinking it was the same thing), creating a stale credential in one location. The actual production secret was the Workers one, which was correct — but the confusion cost an hour of incident debugging.

At month six, ChickenDinner runs correctly and the developer knows the platform better for having fought it. But the path to first working production deploy was longer and more frustrating than the platform's marketing suggested.

### Unknown Unknowns

- **`disable_nodejs_process_v2` must be added to `wrangler.jsonc` before first deploy.** Without it, any page served through `src/middleware.ts` (which runs on every request) will render broken in production with `compatibility_date ≥ 2025-09-15`. This is the most immediate pre-deploy action required. It is not mentioned in the `@astrojs/cloudflare` README or the official Cloudflare Astro guide.

- **Workers and Pages are different products with different CLIs and secrets vaults.** `tech-stack.md` says `cloudflare-pages` but `wrangler.jsonc` wires this as a Worker. Secrets set via `wrangler secret put` live in Workers Secrets; secrets set via the Pages dashboard live in Pages Secrets. They do not share. Using the wrong command during secrets rotation creates a silent override that only surfaces under load.

- **The `@astrojs/cloudflare` adapter uses a floating version range in `package.json`.** A `npm install` on CI can pull a patch release that changes adapter behavior mid-sprint. Pin the adapter at a known-good version after first successful production deploy.

- **`wrangler tail` has rate limits on the free plan in CI/agent contexts.** Live log streaming from a deployed Worker is a paid feature at production scale. On the free plan, `wrangler tail` works in interactive terminal sessions but rate-limits automated queries, affecting the ability to do agent-driven log inspection during an incident.

- **Worker script size limit is 3 MB (free) / 10 MB (paid) compressed.** Astro 6 + React 19 + Tailwind 4 + shadcn/ui + Supabase client has not been audited against this limit. A large dependency tree (e.g., adding a date-picker or a chart library) could push past the 3 MB free-tier limit without obvious build-time warnings.

---

## Operational Story

- **Preview deploys**: Cloudflare Workers does not have automatic branch preview URLs out of the box (that feature belongs to Cloudflare Pages). As a Worker, each `wrangler deploy` overwrites the production Worker. To test pre-merge, deploy to a named environment: `wrangler deploy --env staging` (requires an `[env.staging]` block in `wrangler.jsonc`). Cloudflare Access can protect staging URLs if needed — not required for this solo MVP.

- **Secrets**: Secrets live in Cloudflare Workers Secrets, set via `wrangler secret put SUPABASE_URL` and `wrangler secret put SUPABASE_KEY`. They are encrypted at rest, not visible after setting, and scoped per Worker (not shared with any Pages project). CI reads them from GitHub repository secrets (`SUPABASE_URL`, `SUPABASE_KEY`) injected into the build step. Rotation: `wrangler secret put <NAME>` overwrites the value; the new value takes effect on next deploy.

- **Rollback**: `wrangler rollback` initiates an interactive rollback from the last 100 versions; `wrangler rollback <version-id>` is non-interactive and scriptable. Rollbacks typically propagate globally within 30–60 seconds. Caveats: Supabase database migrations do not roll back automatically — if a deploy included a schema migration, rolling back the Worker code requires a separate manual DB migration to reverse schema changes.

- **Approval**: Actions requiring a human: rotating the primary Supabase service-role key (Supabase dashboard), dropping or modifying the Supabase database schema (Supabase dashboard + `supabase db push`), adding/removing Cloudflare Workers Secrets for unrelated projects. An agent may perform unattended: `wrangler deploy`, `wrangler rollback <version-id>`, `wrangler tail`, `wrangler secret put` for known secrets, reading logs via MCP Observability server.

- **Logs**: `wrangler tail` — streams live request/error logs from the deployed Worker in real time. Filter by status code: `wrangler tail --status error`. Via MCP: `observability.mcp.cloudflare.com/mcp` (GA) exposes structured log queries as named tools, enabling agent-driven log analysis without parsing CLI output. Both require authentication (Wrangler API token or MCP OAuth).

---

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| `nodejs_compat` + `compatibility_date ≥ 2025-09-15` causes middleware to render `[object Object]` in production | Devil's advocate | **H** (bug is active, flag missing from repo) | **H** (all SSR pages broken) | Add `"disable_nodejs_process_v2"` to `compatibility_flags` in `wrangler.jsonc` **before first deploy**. Verify with `wrangler dev` that middleware renders correctly after the fix. |
| Free-tier 10 ms CPU limit exceeded by SSR pages with Supabase auth + React rendering | Devil's advocate | **M** (depends on render complexity) | **M** (intermittent 429s, hard to diagnose) | Budget $5/month for the Workers paid plan from day one. Monitor CPU usage via Cloudflare dashboard; set an alert at 80% of the monthly CPU-ms allowance. |
| Workers vs. Pages product confusion leads to secrets set in the wrong vault | Unknown unknowns | **M** (course materials say "Pages") | **M** (stale credential survives rotation attempt) | Document clearly in CLAUDE.md that this is a Worker (not Pages). Use only `wrangler secret put` for secrets. Never use the Pages dashboard secrets section. |
| Future `compatibility_date` bump introduces new breaking behavior | Unknown unknowns | **M** (Cloudflare ships behavior changes behind dates) | **L–M** (depends on what changes) | Before bumping `compatibility_date`, read the Cloudflare Workers Compatibility changelog and test in `wrangler dev` first. Pin the date explicitly and treat bumps as releases. |
| Worker script size exceeds 3 MB free-tier limit after adding UI dependencies | Pre-mortem | **L** (current stack is lightweight) | **M** (build succeeds, deploy fails) | Run `wrangler deploy --dry-run` periodically to check bundle size. Upgrade to paid plan ($5/mo) if approaching 3 MB. The paid plan raises the limit to 10 MB. |
| `@astrojs/cloudflare` adapter patch release changes routing/middleware behavior | Unknown unknowns | **L** (patches are usually safe) | **M** (production regression without a code change) | After first successful production deploy, pin the adapter version in `package.json` (remove `^`). Review CHANGELOG before any adapter upgrade. |
| Vendor lock-in grows as Cloudflare primitives (D1, KV, R2) are added | Devil's advocate | **L** (no primitives planned for MVP) | **L** (migration cost only materializes at platform switch) | For MVP, use only Supabase as the data layer. Defer any Cloudflare-native storage to post-MVP when platform commitment is deliberate. |
| `wrangler tail` rate-limited in CI/agent contexts on free plan | Unknown unknowns | **L** (only matters for automated log inspection) | **L** (logs still available via MCP Observability or dashboard) | For agent-driven log inspection, prefer the Cloudflare MCP Observability server (`observability.mcp.cloudflare.com/mcp`) over `wrangler tail`. |

---

## Getting Started

First deploy checklist — specific to this repo's pinned versions (Astro 6, `@astrojs/cloudflare`, `wrangler` v3+):

1. **Fix the middleware rendering bug before anything else.** Open `wrangler.jsonc` and change:
   ```jsonc
   "compatibility_flags": ["nodejs_compat"]
   ```
   to:
   ```jsonc
   "compatibility_flags": ["nodejs_compat", "disable_nodejs_process_v2"]
   ```
   Verify locally with `npm run dev` (test the `/dashboard` route, which requires auth middleware).

2. **Authenticate with Cloudflare:**
   ```bash
   npx wrangler login
   ```
   This opens a browser OAuth flow. The resulting token is stored in `~/.wrangler/config/default.toml`.

3. **Set production secrets** (do not use `.dev.vars` for production):
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```
   These are Workers Secrets — not Pages secrets. Enter values from the Supabase project dashboard (Settings → API).

4. **Build and deploy:**
   ```bash
   npm run build
   npx wrangler deploy
   ```
   The CLI prints the Worker URL on success (e.g., `https://10x-astro-starter.<account>.workers.dev`). Verify the live URL renders the home page and that `/auth/signin` works end-to-end.

5. **Set up GitHub Actions secrets** for CI auto-deploy on merge to `main`:
   - Add `CLOUDFLARE_API_TOKEN` (with `Workers Scripts: Edit` permission) and `CLOUDFLARE_ACCOUNT_ID` to GitHub repository secrets.
   - Add `SUPABASE_URL` and `SUPABASE_KEY` to GitHub repository secrets (for the build step).
   - Note: the existing `.github/workflows/ci.yml` triggers on `master`, not `main` — update the branch name in the workflow file to match the working branch before testing CI.

---

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions workflow content)
- Production-scale architecture (multi-region, HA, disaster recovery)
- Cloudflare Workers for Platforms (multi-tenant deployments)
- Database migration tooling and strategies (covered separately via Supabase CLI)
