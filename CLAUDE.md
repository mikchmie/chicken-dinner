# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**ChickenDinner** — meal-scheduling web app (Polish-language UI). Generates dinner schedules from a personal recipe library, optimizing for variety across a chosen period. MVP scope and non-goals are in @ChickenDinner-MVP.md.

The codebase is built on the `10x-astro-starter` template — most of the auth/runtime scaffolding (sign-in/sign-up flows, Supabase wiring, Cloudflare adapter) comes from the starter and is not yet customized for ChickenDinner. The domain features (recipes, schedules, generation algorithm) have not been implemented yet.

## Repo-specific tripwires

- **Never write to `context/archive/`** — archived changes are immutable. If a resolved target path starts with `context/archive/`, open a new change with `/10x-new` instead.
- The starter is named `10x-astro-starter` in `package.json`, `wrangler.jsonc`, and `README.md`. Don't rename these wholesale unless explicitly asked — the Cloudflare worker `name` field affects deployments.
- ESLint runs in **type-checked mode** (`projectService: true`) — adding new top-level dirs may require updating `.gitignore` or the ESLint config to keep type-checking working. CI runs `npx astro sync` before `npm run lint` for the same reason.
- CI triggers on pushes/PRs to `master`, but the working branch is `main`. If you push to `main` and CI doesn't run, that's why — rename branches or update `.github/workflows/ci.yml` rather than silently working around it.
- User-facing copy and config-status messages are in **Polish** (see `src/lib/config-status.ts`, `src/components/Banner.astro`). Match that when adding new UI strings — don't introduce English copy unless asked.
- `output: "server"` + Cloudflare adapter means no Node-only APIs at runtime. Stick to Web APIs (`fetch`, `Headers`, `Request`, `Response`, `crypto.subtle`). `nodejs_compat` is enabled in `wrangler.jsonc` but treat it as an escape hatch.
- Supabase env vars are `optional: true` and `createClient` returns `null` when they're missing — every caller must handle that, including new server endpoints. Don't make Supabase required without updating `src/lib/config-status.ts` and the graceful-degradation pattern.

## Architecture

Astro 6 SSR app with React 19 islands, Tailwind 4, Supabase auth, shadcn/ui components, deployed to Cloudflare Workers.

### Rendering model

- `output: "server"` in `astro.config.mjs` — every page is SSR by default. There is no static build path.
- API routes (`src/pages/api/**/*.ts`) must export `export const prerender = false;` (required because the default is server-mode but the convention is explicit).
- React components run as Astro islands. There is no `"use client"` directive — Astro decides hydration via component directives (`client:load`, `client:idle`, etc.) on the importing `.astro` file.

### Auth + middleware

- `src/lib/supabase.ts` — `createClient(headers, cookies)` returns a `@supabase/ssr` server client with cookie session handling. Returns `null` when `SUPABASE_URL`/`SUPABASE_KEY` are missing, so the app can still render in unconfigured environments — always null-check the result.
- `src/middleware.ts` — runs on every request, resolves the current user into `context.locals.user`, and redirects unauthenticated users away from `PROTECTED_ROUTES`. Add new gated paths to that array (currently just `/dashboard`).
- `App.Locals.user` is typed in `src/env.d.ts` — access in `.astro` pages via `Astro.locals.user` and in API routes via `context.locals.user`.
- Routes: `src/pages/auth/{signin,signup,confirm-email}.astro`, endpoints at `src/pages/api/auth/{signin,signup,signout}.ts`, protected example at `src/pages/dashboard.astro`.

### Env vars

- Declared in `astro.config.mjs` under `env.schema` using `envField` — currently `SUPABASE_URL`, `SUPABASE_KEY`, both `context: "server", access: "secret", optional: true`. Import them from `astro:env/server`, never `process.env`.
- `optional: true` is intentional — the app degrades gracefully when Supabase isn't configured. `src/lib/config-status.ts` surfaces a Polish-language banner on missing config; follow that pattern when adding new optional integrations.
- Local dev secrets: `.env` for Node-side tooling and `.dev.vars` for the Cloudflare workerd runtime (both gitignored). Copy `.env.example`. After adding a new env var to `env.schema`, run `npx astro sync` so the `astro:env/server` types update.
- Production: `npx wrangler secret put SUPABASE_URL` etc. — CI also passes `SUPABASE_URL`/`SUPABASE_KEY` from repo secrets to the build step.

## Conventions

- **Path alias**: `@/*` → `./src/*` (tsconfig). Use it for cross-feature imports.
- **Astro for static markup/layout, React for interactivity.** Don't reach for React when an `.astro` component suffices — `src/components/Welcome.astro`, `src/components/Topbar.astro` are the canonical reference for non-interactive UI; `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx` show the interactive React shape.
- **Class merging**: use `cn()` from `@/lib/utils` (clsx + tailwind-merge). Don't concatenate Tailwind class strings manually — it breaks tailwind-merge conflict resolution.
- **shadcn/ui**: `src/components/ui/`, "new-york" style (per `components.json`). Add new primitives with `npx shadcn@latest add <name>`. Keep `auth/` components separate from `ui/` primitives.
- **API routes**: uppercase method exports (`export const POST = ...`); validate input with `zod` (not yet added — pull it in when writing the first endpoint that needs validation).
- **React hooks**: extract reusable ones to `src/components/hooks/` (directory does not exist yet — create it when needed).
- **Services / business logic**: `src/lib/` (or `src/lib/services/` for extracted domain logic — the generation algorithm will live there).
- **Shared types**: `src/types.ts` (entities, DTOs). File does not exist yet — create it when the first cross-module type appears.
- **Supabase migrations**: `supabase/migrations/` (directory empty so far). File naming: `YYYYMMDDHHmmss_short_description.sql`. **Always enable RLS** on new tables with granular per-operation, per-role policies — this app is single-tenant per user, so policies must scope by `auth.uid()`.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime via `@astrojs/cloudflare`)
- `npm run build` — production build (SSR)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules (uses `tseslint.configs.strictTypeChecked` + `stylisticTypeChecked`)
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (`prettier-plugin-astro` + `prettier-plugin-tailwindcss`)
- `npx astro sync` — regenerate Astro/env types (CI runs this before lint; do this after editing `astro.config.mjs` `env.schema`)
- `npx supabase start` / `npx supabase stop` — local Supabase stack (Docker required)
- `npx wrangler deploy` — deploy to Cloudflare Workers

Pre-commit (`.husky/pre-commit` + lint-staged): `eslint --fix` on `*.{ts,tsx,astro}`, `prettier --write` on `*.{json,css,md}`. Don't bypass with `--no-verify` — fix the underlying lint/type error.

## 10xDevs context (course workflow)

This repo is the playground for the **10xDevs AI Toolkit** course. Foundation artifacts live under `context/foundation/` (e.g. `prd.md`, `tech-stack.md`, `lessons.md`); change records under `context/changes/`. The `context/archive/` write-prohibition is in the tripwires section above.

The current lesson (M1L4 — agent context) is documented in @docs/m1l4-lesson.md. Skill chain: `/10x-init → /10x-shape → /10x-prd → /10x-tech-stack-selector → /10x-bootstrapper → /10x-agents-md → /10x-rule-review → /10x-lesson`. Re-run upstream skills (e.g. `/10x-prd`, `/10x-tech-stack-selector`) to fix decisions rather than padding this file with corrections.

## References

- @README.md — setup, Supabase configuration (local + cloud), auth routes table, deployment
- @ChickenDinner-MVP.md — product scope and non-goals (Polish)
- @docs/m1l4-lesson.md — course context for the agent-context lesson

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 1

Open Module 3 by producing a **durable, risk-first quality contract** before any test is written — then drive each rollout phase through the standard change chain.

```
PRD + roadmap + archive
        │
        ▼
   /10x-test-plan  ──►  context/foundation/test-plan.md  (strategy §1–§5 frozen + cookbook §6 grows)
        │
        ▼  (one rollout phase at a time, /clear between handoffs)
   /10x-new ──► /10x-research ──► /10x-plan ──► /10x-implement
```

`/10x-test-plan` is a **stateful orchestrator**, not a one-shot generator. On first run it writes the phased rollout to `context/foundation/test-plan.md`. On every subsequent run it re-derives state from on-disk artifacts and presents the next handoff. The lesson focus is **strategy and rollout sequencing, not configuration**. Hooks, MCP servers, and CI YAML are configured in later lessons of this module.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Quality strategy as a rules-file (lesson focus)** | |
| `/10x-test-plan` | You have a PRD (and ideally a roadmap and a few archived slices) and you are about to write the project's first tests, or you noticed that AI-generated tests are landing on helpers while critical flows go uncovered. First invocation runs discovery (PRD + roadmap + archive + hot-spot scan), a 5-question user interview, and a synthesis pass with a mandatory challenger check, then writes `test-plan.md` in `context/foundation/` with a risk map (5–7 failure scenarios), a phased rollout table, a stack table, a quality-gates table, a cookbook section (`§6`, fills in as phases ship), and a negative-space section (what we deliberately don't test). Subsequent invocations advance the rollout one handoff at a time. |
| `/10x-test-plan --status` | A `test-plan.md` already exists and you want a compact snapshot of where the rollout stands — which phases are `not started`, `change opened`, `researched`, `planned`, `implementing`, or `complete`, and what the next action is. Does no work; safe to run any time. |
| `/10x-test-plan --refresh` | A `test-plan.md` already exists and one of: a new top-3 risk surfaced from the roadmap or archive, a tool's `checked:` date is older than three months, the project's tech stack changed, or §7 negative-space no longer matches what the team believes. Opens a new `test-plan-refresh-<YYYY-MM-DD>` change folder rather than editing the guide in place. |

### Rollout chain — what happens after the guide is written

The guide's §3 *Phased Rollout* table is the orchestrator's state. For each non-`complete` row the orchestrator selects the next handoff based on which artifacts exist in `context/changes/<change-id>/`:

| State on disk | Next handoff | Status transitions to |
| --- | --- | --- |
| change folder missing | `/10x-new <change-id>` | `change opened` |
| `change.md` only | `/10x-research` (with a risks-to-verify brief) | `researched` |
| `+ research.md` | `/10x-plan` (with cost × signal + cookbook-update constraints) | `planned` |
| `+ plan.md` with pending `## Progress` items | `/10x-implement <change-id> phase <N>` | `implementing` / `complete` |
| `+ plan.md` fully `[x]` | Mark §3 row `complete`; loop to next pending row | — |

Each handoff is a **STOP point**. The orchestrator copies the next command to the clipboard, asks the user to `/clear` and run it, then exits. Re-invoke `/10x-test-plan` (no arguments) to advance.

### Risk-first prioritization rules

- Risks are **failure scenarios in user / business terms**, not test names. "Logged-out user reaches paid content via stale token" is a risk; "test the login form" is not.
- 5 to 7 risks. Fewer is too coarse; more makes prioritization useless.
- Impact and likelihood are user/business ratings, not technical complexity.
- Every risk traces to a source: PRD section, archived slice, roadmap entry, Phase 2 interview question, hot-spot **directory** with churn count, or a tech-stack constraint. No invented risks.
- **Signal, not knowledge.** §2 cites *evidence that raised the risk*, never a file as "where the failure lives." File:line anchors, function names, schema names, and module names are forbidden in §2 — they belong in `/10x-research`'s output, produced per rollout phase against current code. The plan is a QA spec; it is not a code audit.
- Coverage is not the metric. **Risk coverage** is the metric.

### Dual-layer mapping rules

- Classic layer first: the cheapest test that gives a real signal wins. Promote to e2e only when no cheaper layer covers the risk.
- AI-native layer second, and only where it adds signal classic tests do not give cheaply.
- Every AI-native row has a **"When NOT to use"** line. If you cannot write one, drop the row.
- Every tool name carries a `checked: <YYYY-MM-DD>` date. Tool names are examples of the category, not endorsements.
- Both layers must be non-empty in the final guide if the project warrants them. Classic-only is a 2020 plan; AI-native-only is hype. AI-native phases are not mandatory — include them only when the brief justified them under cost × signal.

### Quality gates rules

- Required gates (lint, typecheck, unit+integration, e2e on critical flows) must map to actual CI steps. If a required gate is not yet wired, mark it as `required after §3 Phase <N>` and let the named rollout phase wire it.
- Post-edit hook is **recommended local**, not a CI substitute.
- Multimodal visual review is **selective**, applied to 1–3 critical screens, not to every page.
- Vision-driven fallback (Anthropic Computer Use or OpenAI CUA) is reserved for DOM-unreachable surfaces; expensive per action.

### Cookbook patterns (§6) — fills in over time

`test-plan.md` is both a phased strategy and a **growing cookbook**. §6 starts as placeholders (`TBD — see §3 Phase <N>`) and fills in incrementally — each rollout phase's plan ends with a sub-phase that updates the relevant §6 entry (location, naming, reference test, run command). After Module 3 completes, §6 becomes the canonical answer to "how do I add a test for X in this project?" — and is what `/10x-tdd` reads in Lesson 2.

### Lesson boundaries

- Do not write test code. That is Lesson 2 (`/10x-tdd` and unit-test authoring).
- Do not configure hooks, hook lifecycle, or debugging hooks. That is Lesson 3.
- Do not configure MCP servers, Playwright API, e2e code, or multimodal scenario code. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test workflow. That is Lesson 5.
- Do not author CI/CD pipelines from scratch or write GitHub Actions YAML. The guide names gates; configuration is owned by Module 1 Lesson 5 and Module 2 Lesson 5.
- Do not benchmark multimodal models. Cite criteria (cost, latency, agent-friendliness), never a ranking.
- Do not read the codebase for knowledge (call graphs, schemas, "which file owns this failure"). That is `/10x-research`'s job, per rollout phase.

### Paths used by this lesson

- `context/foundation/test-plan.md` — the quality contract produced and maintained by `/10x-test-plan`
- `context/foundation/prd.md` — primary risk source
- `context/foundation/roadmap.md` — likelihood weighting
- `context/foundation/tech-stack.md` — stack input (when present)
- `context/archive/<change-id>/plan.md` — implemented risk surface
- `context/changes/<change-id>/` — per-rollout-phase change folder (one per row in §3)

<!-- END @przeprogramowani/10x-cli -->
