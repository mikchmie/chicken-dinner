---
bootstrapped_at: 2026-05-24T18:04:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: chicken-dinner
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: chicken-dinner
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

A solo developer shipping a 7-day dinner scheduler in 3 after-hours weeks needs a starter that covers auth and a relational database out of the box, with minimal ceremony on the path to first deploy. The 10x Astro Starter (Astro 6 + React 19 + TypeScript + Tailwind + Supabase + Cloudflare Pages) is the recommended default for `(web-app, js)` and passes all four agent-friendly quality gates: fully typed via TypeScript and Zod, strongly convention-based, heavily represented in training data, and well-documented. Supabase covers both auth (FR-001–003) and the PostgreSQL storage for recipes and schedules, so no additional auth wiring is needed post-scaffold. The 3-week solo timeline and after-hours constraint favour battle-tested defaults over novelty — standard path was taken. Cloudflare Pages is the starter's native deployment target; GitHub Actions drives CI with auto-deploy on merge to main.

## Pre-scaffold verification

| Signal      | Value                                                       | Severity     | Notes                                                         |
| ----------- | ----------------------------------------------------------- | ------------ | ------------------------------------------------------------- |
| npm package | not run                                                     | —            | cmd_template starts with `git clone`; npm package check skipped |
| GitHub repo | not run                                                     | —            | gh CLI not installed; recency check unavailable               |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: clone starter repo, strip git history, move files up into cwd
**Exit code**: 0
**Files moved**: 19
**Conflicts (.scaffold siblings)**: `CLAUDE.md` → `CLAUDE.md.scaffold`
**.gitignore handling**: append-merged — 9 new lines added from starter (`.astro/`, `npm-debug.log*`, `yarn-debug.log*`, `yarn-error.log*`, `pnpm-debug.log*`, `.env.production`, `.dev.vars`, `.wrangler/`, `.idea/`) under `# from 10x-astro-starter` separator
**.bootstrap-scaffold cleanup**: deleted

**File move log:**

| File / Directory    | Action                    |
| ------------------- | ------------------------- |
| `.env.example`      | moved silently            |
| `.github/`          | moved silently            |
| `.gitignore`        | append-merged             |
| `.husky/`           | moved silently            |
| `.nvmrc`            | moved silently            |
| `.prettierrc.json`  | moved silently            |
| `.vscode/`          | moved silently            |
| `astro.config.mjs`  | moved silently            |
| `CLAUDE.md`         | sidelined as `CLAUDE.md.scaffold` (cwd version wins) |
| `components.json`   | moved silently            |
| `eslint.config.js`  | moved silently            |
| `node_modules/`     | moved silently            |
| `package-lock.json` | moved silently            |
| `package.json`      | moved silently            |
| `public/`           | moved silently            |
| `README.md`         | moved silently            |
| `src/`              | moved silently            |
| `supabase/`         | moved silently            |
| `tsconfig.json`     | moved silently            |
| `wrangler.jsonc`    | moved silently            |
| `context/**`        | not present in scaffold (preserved) |

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0 CRITICAL/HIGH direct; 2 MODERATE direct (`@astrojs/check`, `wrangler`); 7 MODERATE transitive

#### HIGH findings

**Package**: `devalue` v5.6.3–5.8.0
**Advisory**: GHSA-77vg-94rm-hx3p
**Title**: Svelte devalue: DoS via sparse array deserialization
**CVSS**: 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H)
**CWE**: CWE-770 (Allocation of Resources Without Limits or Throttling)
**Via**: transitive dependency — not a direct dependency of this project
**Fix available**: yes (`npm audit fix` should resolve)

#### MODERATE findings

All 9 MODERATE findings are log-only (below inline chat threshold). Summary:

| Package | Scope | Via | Advisory |
| --- | --- | --- | --- |
| `@astrojs/check` | direct | `@astrojs/language-server` | volar-service-yaml chain |
| `@astrojs/language-server` | transitive | `volar-service-yaml` | GHSA-48c2-rrv3-qjmp chain |
| `@cloudflare/vite-plugin` | transitive | `miniflare`, `wrangler`, `ws` | ws GHSA-58qx-3vcg-4xpx chain |
| `miniflare` | transitive | `ws` | GHSA-58qx-3vcg-4xpx chain |
| `volar-service-yaml` | transitive | `yaml-language-server` | yaml stack overflow chain |
| `wrangler` | direct | `miniflare` | ws GHSA-58qx-3vcg-4xpx chain |
| `ws` | transitive | GHSA-58qx-3vcg-4xpx | Uninitialized memory disclosure, CVSS 4.4 |
| `yaml` | transitive | GHSA-48c2-rrv3-qjmp | Stack Overflow via deeply nested YAML, CVSS 4.3 |
| `yaml-language-server` | transitive | `yaml` | GHSA-48c2-rrv3-qjmp chain |

## Hints recorded but not acted on

| Hint                    | Value            |
| ----------------------- | ---------------- |
| bootstrapper_confidence | first-class      |
| quality_override        | false            |
| path_taken              | standard         |
| self_check_answers      | null             |
| team_size               | solo             |
| deployment_target       | cloudflare-pages |
| ci_provider             | github-actions   |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true             |
| has_payments            | false            |
| has_realtime            | false            |
| has_ai                  | false            |
| has_background_jobs     | false            |

These hints are preserved here as the audit-trail for the future M1L4 skill ("Memory Architecture"), which will act on them (CLAUDE.md / AGENTS.md generation, CI scaffolding, deployment configuration). v1 bootstrapper surfaces but does not compensate for any of these.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- Review `CLAUDE.md.scaffold` — diff it against your existing `CLAUDE.md` to pull in any starter conventions you want to keep.
- Copy `.env.example` to `.env` (for Node local dev) and to `.dev.vars` (for Cloudflare local dev), then fill in `SUPABASE_URL` and `SUPABASE_KEY`.
- Run `npx supabase start` (requires Docker) to spin up local Supabase.
- Address the `devalue` HIGH finding at your discretion — it is a transitive dep; `npm audit fix` should resolve it.
- Review the 9 MODERATE findings in this log and decide your risk tolerance — most are dev-time tooling (wrangler, @astrojs/check) and do not affect production runtime.
