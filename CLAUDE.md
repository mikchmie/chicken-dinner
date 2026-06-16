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

## 10xDevs AI Toolkit - Module 3, Lesson 3

Lesson 3 is about **hooks** — turning the quality gates from Lesson 1 and the tests from Lesson 2 into automatic, deterministic checks that fire while the agent works. A hook runs outside the model, so it survives context compression, instruction changes, and the model "forgetting". The payoff for agentic hooks specifically: a `PostToolUse` check can feed its result back into the agent's context, so the agent fixes trivial errors (formatting, a missing import, a wrong type) on its own in the next iteration instead of you discovering them minutes later.

```
context/foundation/test-plan.md  (§4 Quality Gates: which check, required when)
        │
        ▼  (assign each gate to the cheapest layer that still gives signal)
   per-edit (agent hooks)  →  pre-commit (git hooks)  →  pre-push  →  CI
        │ lint, format, scoped tests          │ staged       │ heavier    │ integration
        ▼
   exit code + stdout  →  additionalContext  →  agent reacts next turn
```

### Task Router — Which layer for this check

| You want to | Do this |
| --- | --- |
| React the instant the agent edits a file | A per-edit hook (`PostToolUse` matcher `Write\|Edit` in Claude Code). Right for fast checks: lint/format, and scoped tests on risk-area files. This is the **only** layer that can hand feedback to the agent mid-session. |
| Run only the tests that depend on the edited file | Parse the path from the hook's stdin (`jq -r .tool_input.file_path`) and run your runner's related-tests mode (`vitest related "$FILE" --run`, `jest --findRelatedTests $FILE`). Gate it on whether the file is a risk area in `test-plan.md`; don't run tests on every helper or config edit. |
| Catch changes that bypassed the agent (manual edits, a teammate's commit) | A pre-commit git hook (Lefthook or Husky+lint-staged) over staged files: lint + typecheck, and tests on staged risk files. |
| Run heavier checks before code leaves the machine | Pre-push: full typecheck or a broader test set. Anything too slow for per-edit moves here. |
| Decide where a given gate belongs | Ask: is it fast enough (a few seconds) for per-edit, or should it wait for commit/push/CI? Slow checks block the agent loop on every edit — push them up a layer. |
| Use the same hook across tools | The trigger → matcher → handler → signal pattern is the same in Cursor, Codex, Windsurf, and Copilot; only the config file and event names change. See the cross-tool table below. |

### Hook lifecycle — the universal pattern

Every tool's hooks follow four steps:

1. **Trigger** — an event in the tool (e.g. the agent just saved a file: `PostToolUse`).
2. **Matcher** — a filter deciding whether this hook runs (tool name like `Write`/`Edit`, file type, or a name pattern).
3. **Handler** — the action that runs, usually a shell command.
4. **Signal** — the result returns to the tool. The exit code says pass/fail; stdout can flow into the agent's context as feedback.

### Exit codes and the feedback loop

- **0** — success; the hook passed, continue.
- **2** — blocking error; the agent sees the feedback and should react.
- **anything else** — non-blocking error; logged, but does not interrupt work.

On a blocking failure, stdout flows into the agent's context (in Claude Code via `additionalContext`, capped at 10,000 characters; other tools have similar mechanisms with their own limits). That is why the agent can self-correct: it sees the concrete message — missing type, unimported module, badly formatted line — not just "something failed".

The boundary: the agent reliably fixes **trivial** corrections on its own. When a test fails because of wrong business logic, the hook surfaces it but the agent may not diagnose the real cause — it says "something is off" and tries a trivial fix. If that does not resolve in one or two tries, the signal comes back to you, and the problem may deserve its own change-id with the full `/10x-new → /10x-research → /10x-plan → /10x-implement` workflow.

### Three local layers (plus CI)

| Layer | Catches | Timing |
| --- | --- | --- |
| Per-edit (agent hooks) | Formatting, simple type errors, failing unit tests on risk files. Only layer that feeds the agent mid-work. | ms–s |
| Pre-commit (git hooks) | What slipped past per-edit: manual edits, files changed outside the hook, checks too slow for per-edit. Operates on staged files. | s |
| Pre-push | Heavier checks before pushing to remote (full typecheck, broader test set). | s–min |
| CI | Integration problems, cross-module dependencies, checks needing infra unavailable locally. | min |

Local layers do **not** replace CI — CI stays the key verification for shared repo state and environments you don't control. But each local layer that catches an error is one fewer CI round-trip. You don't need all layers from day one: start with one per-edit hook (lint) and one commit gate, add layers as you see what escapes. The quality gates in `test-plan.md §4` decide which checks are worth automating and when; a plan may legitimately defer per-edit hooks if the cost/signal ratio isn't there yet.

### Key rules

- Keep per-edit hooks fast. If a check takes more than a few seconds, move it to commit, push, or CI — a slow per-edit hook blocks the agent loop on every edit. Lint/format are ideal per-edit; full typecheck is often a commit gate in larger projects.
- Run scoped tests, not the whole suite, per edit — only tests related to the edited file, and only when that file is a risk area in `test-plan.md`.
- `related` is a subcommand, not a flag (`vitest related`, not `--related`). Use `--run` so the hook terminates instead of entering watch mode.
- `PostToolUse` fires once per tool use; three edits in one turn fire it three times independently — there is no built-in aggregation.
- The git hook tool (Lefthook vs Husky+lint-staged) is an implementation detail; the rule is the same — run checks on staged files before commit. If Husky already works, don't migrate.
- **Context injection is not universal.** Claude Code, Cursor, Codex, and Copilot (in VS Code) can pass a hook's result to the agent; Windsurf cannot — it can block (exit 2) but can't tell the agent what went wrong.

### The same pattern in every tool

| Tool | Events | Handlers | Context injection | Config |
| --- | --- | --- | --- | --- |
| Claude Code | ~30 | command, http, mcp_tool, prompt, agent | yes | `.claude/settings.json` |
| Cursor | ~18 | command, prompt | yes | `.cursor/hooks.json` |
| Codex | 10 | command | yes | `.codex/hooks.json` |
| Windsurf | 12 | command | **no** | `.windsurf/hooks.json` |
| Copilot | ~13 | command, http, prompt | yes (VS Code) | `.github/hooks/*.json` |

### Lesson boundaries

- This lesson configures hooks and local quality layers only. The hook JSON, `lefthook.yml`, and the per-edit/commit/push layering are the scope.
- Do not write E2E tests, configure Playwright/MCP, or run browser scenarios. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test debugging workflow. That is Lesson 5.
- Do not change the risk strategy or quality-gate definitions. That is Lesson 1 (`/10x-test-plan`); read current state with `/10x-test-plan --status`.
- Do not write unit/integration test code from scratch here. That is Lesson 2 — hooks only *run* the tests those lessons produced.
- Do not author CI/CD pipelines. That is Module 1 Lesson 5 / Module 2 Lesson 5; hooks are the local layers in front of CI.

### Paths used by this lesson

- `.claude/settings.json` — hook configuration (`~/.claude/settings.json` global, `.claude/settings.json` project, `.claude/settings.local.json` local overrides). Other tools use their own config file (see the table).
- `lefthook.yml` — pre-commit git hook config (lint + typecheck + tests on `{staged_files}`).
- `context/foundation/test-plan.md` — §4 quality gates decide which checks to automate and at which layer; risk areas decide which edits warrant scoped tests.

<!-- END @przeprogramowani/10x-cli -->
