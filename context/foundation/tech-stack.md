---
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
---

## Why this stack

A solo developer shipping a 7-day dinner scheduler in 3 after-hours weeks needs a starter that covers auth and a relational database out of the box, with minimal ceremony on the path to first deploy. The 10x Astro Starter (Astro 6 + React 19 + TypeScript + Tailwind + Supabase + Cloudflare Pages) is the recommended default for `(web-app, js)` and passes all four agent-friendly quality gates: fully typed via TypeScript and Zod, strongly convention-based, heavily represented in training data, and well-documented. Supabase covers both auth (FR-001–003) and the PostgreSQL storage for recipes and schedules, so no additional auth wiring is needed post-scaffold. The 3-week solo timeline and after-hours constraint favour battle-tested defaults over novelty — standard path was taken. Cloudflare Pages is the starter's native deployment target; GitHub Actions drives CI with auto-deploy on merge to main.
