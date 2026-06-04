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

## 10xDevs AI Toolkit - Module 2, Lesson 4

Prepare for a harder implementation stream with the **research-backed planning chain**:

```
internal research (/10x-research) + external research (exa.ai, Context7) -> /10x-plan -> /10x-implement -> success
```

The lesson focus is distinguishing internal from external research and using evidence to back planning decisions.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Internal research (lesson focus)** | |
| `/10x-research <change-id>` | You need evidence from the existing codebase — patterns, conventions, integration points, or existing implementations. Runs parallel sub-agents over the repo and writes structured findings to `research.md`. |
| **External research (lesson focus)** | |
| exa.ai | You need AI-native web search for library comparisons, best practices, or ecosystem context that the codebase cannot answer. |
| Context7 (`resolve-library-id` → `get-library-docs`) | You need live, current documentation for a specific library or framework. Resolves a library ID first, then fetches relevant doc pages. |
| **Framing spare wheel** | |
| `/10x-frame <change-id>` | The plan won't converge, the plan doesn't deliver expected results, or persistent drift keeps breaking the implementation. Use as an escape hatch on a separate problem (demonstrated on Space Explorers example), not as pre-research ritual. |
| **Planning and execution** | |
| `/10x-plan <change-id>` / `/10x-implement <change-id> phase <n>` | Use the same planning and execution chain from Lesson 2, now with upstream research evidence feeding the plan. |

### Research discipline

- Internal research (`/10x-research`) answers "what does our codebase already do?" — patterns, schemas, conventions, integration points.
- External research (exa.ai, Context7) answers "what should we do?" — library capabilities, API docs, ecosystem best practices.
- Combine both as evidence-backed input to `/10x-plan`. A plan without research evidence on a non-trivial stream is a guess.
- Agent-friendly docs (`llms.txt`, markdown-for-agents, `/md` endpoints) are a quality signal for library selection — libraries that publish agent-readable docs integrate faster.

### `/10x-frame` as spare wheel

Three triggers for reaching for `/10x-frame`:
1. The plan won't converge — research keeps opening more questions instead of narrowing to a contract.
2. The plan doesn't deliver — implementation repeatedly fails to meet success criteria.
3. Persistent drift — the implementation keeps diverging from the plan in ways that suggest the problem was mis-framed.

Demonstrated on a Space Explorers example, not the SRS path. It is an escape hatch, not a mandatory step.

### Paths used by this lesson

- `context/changes/<change-id>/research.md` - internal research output
- `context/changes/<change-id>/frame.md` - framing output when needed
- `context/changes/<change-id>/plan.md` - evidence-backed implementation contract
- `context/foundation/lessons.md` - recurring rules and pitfalls

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
