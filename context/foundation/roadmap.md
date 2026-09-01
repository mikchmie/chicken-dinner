---
project: ChickenDinner
version: 1
status: draft
created: 2026-05-31
updated: 2026-06-16
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: ChickenDinner

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

A home cook with an established recipe repertoire keeps falling back to the same 5–10 familiar meals — not from lack of knowledge, but from decision fatigue at planning time. Existing meal apps are discovery engines or nutrition trackers; neither serves the user who wants variety within a known set. ChickenDinner works exclusively from recipes the user already knows and enforces diversity algorithmically — the system tracks repetition history so the user doesn't have to.

## North star

**S-03: User generates their first varied 7-day schedule** — once a signed-in user with a populated collection can press "generate" and receive a schedule with no two consecutive days sharing a meal, the differentiating feature is real. Until this lands, the app is generic CRUD.

> "North star" here means the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as Prerequisites allow because everything else only matters if this works. Defined once on first use; not repeated below.

## At a glance

| ID    | Change ID                       | Outcome (user can …)                                                            | Prerequisites    | PRD refs                            | Status   |
| ----- | ------------------------------- | ------------------------------------------------------------------------------- | ---------------- | ----------------------------------- | -------- |
| F-01  | recipes-and-schedules-schema | (foundation) recipes + schedules schema is in place with per-user RLS         | —                | NFR (data isolation), Guardrail, FR-005, FR-007, FR-008 | ready    |
| S-01  | signed-in-empty-home            | sign up, sign in, sign out, and land on an empty ChickenDinner recipe list      | F-01             | FR-001, FR-002, FR-003, FR-004      | done     |
| S-02  | add-recipe-to-collection        | add a recipe (name + category) to their collection                              | S-01, F-01       | FR-005                              | done     |
| S-03  | first-generated-schedule        | generate a 7-day schedule with no consecutive duplicate meals; view it          | S-02, F-01       | US-01, FR-008, FR-009               | done     |
| S-04  | category-aware-diversity        | generate a schedule whose consecutive days also don't share an ingredient category | S-03           | FR-008, Business Logic              | done     |
| S-05  | recipe-edit-delete-with-cascade | edit or delete a recipe; deleted recipes show as `[deleted]` in past schedules  | S-03, F-01       | FR-006, FR-007                      | proposed |
| S-06  | delete-latest-schedule          | delete their most recently generated schedule                                   | S-03             | FR-010                              | done |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                          | Chain                                          | Note                                                                                       |
| ------ | ------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A      | Path to north star             | `F-01` → `S-01` → `S-02` → `S-03`              | Critical path. Sequenced strictly for `main_goal: speed` — ships the north star earliest. |
| B      | Post-launch closure (parallel) | `S-04` / `S-05` / `S-06` (all branch off `S-03`) | After S-03 lands the three branches are independent; agents/sessions can fan out across them. |

## Baseline

What's already in place in the codebase as of `2026-05-31` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 + Tailwind 4 with shadcn/ui scaffold (`src/components/ui/button.tsx`). Domain UI not implemented.
- **Backend / API:** partial — Astro SSR + `@astrojs/cloudflare` adapter wired; only `src/pages/api/auth/*` exists. No domain endpoints; `zod` not yet added (introduce in the first slice that needs validation, per CLAUDE.md).
- **Data:** partial — Supabase client wired in `src/lib/supabase.ts` with null-safe `createClient`; `supabase/migrations/` is empty. No domain schema, no `src/types.ts`.
- **Auth:** present — sign-in / sign-up / confirm-email pages, API routes, middleware gating `/dashboard` (`src/middleware.ts`). Per tech-stack.md and the 10x-astro-starter.
- **Deploy / infra:** present — `wrangler.jsonc` has `disable_nodejs_process_v2` already applied (per `lessons.md`); `.github/workflows/ci.yml` exists; first production deploy landed ("M1L5 deployed").
- **Observability:** partial — `wrangler.jsonc` enables Cloudflare-native observability; no Sentry, no app-level metrics. PRD does not require more — leave as-is for MVP.

## Foundations

### F-01: Recipes + schedules schema with per-user RLS

- **Outcome:** (foundation) the database has tables for recipes, schedules, and schedule-day assignments, with row-level security scoping every read/write to the authenticated user; shared TypeScript types are exported for downstream slices.
- **Change ID:** recipes-and-schedules-schema
- **PRD refs:** Non-Functional Requirements (data isolation), Guardrail (recipes never lost or corrupted), FR-005 (recipe schema: name + category), FR-008 (schedules), FR-007 (deletion cascade contract)
- **Unlocks:** S-01 (queries the recipes table for the empty-list state), S-02 (write path for recipes), S-03 (write/read path for schedules and the join to recipes), S-05 (the cascade rule lives here)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - When a recipe is deleted but appears in a past schedule, is the FK nulled with a `[deleted]` label at render time, or is the recipe soft-deleted with a deleted-at flag and the original row kept? Owner: implementer (`/10x-plan` on S-05 will lock this). Block: no — F-01 only needs to make the decision durable; both shapes are forward-compatible.
- **Risk:** RLS bugs are silent and catastrophic per NFR data-isolation; the schema also fixes the category enum (closed list of six). Sequenced first because S-01 already queries the recipes table for its empty state — without F-01 every downstream slice would mock data and that's the slow path under `main_goal: speed`.
- **Status:** ready

## Slices

### S-01: User can sign in and land on an empty ChickenDinner home

- **Outcome:** user can sign up, sign in, sign out, and after signing in see a ChickenDinner-branded landing page that lists their (empty) recipe collection.
- **Change ID:** signed-in-empty-home
- **PRD refs:** FR-001, FR-002, FR-003, FR-004
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Keep the starter's `/dashboard` route or relocate the post-login landing (e.g., `/recipes`)? Owner: implementer. Block: no — naming choice; either path satisfies FR-004.
- **Risk:** small slice but load-bearing — it's where the generic 10x-astro-starter shell becomes the ChickenDinner app. Polish-language copy lands here (CLAUDE.md tripwire); skipping it would push the localisation work into S-02 where it competes with the first write path.
- **Status:** done

### S-02: User can add a recipe to their collection

- **Outcome:** user can open an add-recipe form, supply a name and a category from the closed list of six, and see the recipe in their collection list.
- **Change ID:** add-recipe-to-collection
- **PRD refs:** FR-005
- **Prerequisites:** S-01, F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Single source of truth for the six-value category enum — PostgreSQL enum vs. a `zod` enum vs. both, kept in sync via `src/types.ts`? Owner: implementer. Block: no — pick one in `/10x-plan` on S-02 and stick to it across S-03/S-05.
- **Risk:** this slice introduces the first server endpoint that validates user input — the `zod` pattern set here becomes the template for every later API route. A sloppy contract here ripples; a clean one accelerates S-03 and beyond. Sequenced before S-03 because the north star needs ≥ 5 real recipes to exercise the diversity rule (US-01 Given).
- **Status:** done

### S-03: User generates their first 7-day schedule with no consecutive duplicate meals

- **Outcome:** user with ≥ 5 recipes presses "generate" and sees an ordered 7-day schedule drawn from their collection, where no two adjacent days share the same meal; the schedule is persisted and visible on revisit.
- **Change ID:** first-generated-schedule
- **PRD refs:** US-01, FR-008, FR-009
- **Prerequisites:** S-02, F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - When the collection has fewer than 7 recipes, is repetition allowed on non-adjacent days, or does the algorithm relax the no-consecutive-meal rule too? Owner: implementer. Block: no — PRD says best-effort and never refuses; both shapes satisfy that.
- **Risk:** this is the north star. It introduces the schedule storage shape (which S-05's cascade and S-06's delete depend on) and the first generation algorithm. Acceptance Criteria for US-01 is the bar; the category-aware refinement is deferred to S-04 so the north star ships before algorithm polish.
- **Status:** done

### S-04: Schedule generator also enforces category diversity

- **Outcome:** user generates a schedule whose consecutive days don't share a base-ingredient category, in addition to not sharing a meal — making variety the visible product trait rather than just non-repetition.
- **Change ID:** category-aware-diversity
- **PRD refs:** FR-008 (the "minimises clustering of the same base-ingredient category" clause), Business Logic, Secondary Success Criterion
- **Prerequisites:** S-03
- **Parallel with:** S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - "Minimises clustering" is fuzzy in PRD — is the objective no-consecutive-category (hard), balanced bins across 7 days (softer), or a weighted multi-objective? Owner: implementer. Block: no — PRD says best-effort; the algorithm can iterate.
- **Risk:** without this slice the product ships but the differentiating feature (variety beyond mere uniqueness) is hidden — Secondary Success Criterion goes unmet. Bias to `speed` keeps this after S-03; if it slips past the deadline the MVP still satisfies the Primary Success Criterion.
- **Status:** done

### S-05: User can edit or delete a recipe; deleted recipes show as `[deleted]` in past schedules

- **Outcome:** user can edit any recipe in their collection and delete recipes; past schedules referencing a deleted recipe show the literal text `[deleted]` for that slot rather than disappearing or breaking.
- **Change ID:** recipe-edit-delete-with-cascade
- **PRD refs:** FR-006, FR-007
- **Prerequisites:** S-03, F-01
- **Parallel with:** S-04, S-06
- **Blockers:** —
- **Unknowns:**
  - Cascade implementation: null the FK and render `[deleted]` from the absent join, or soft-delete the recipe row and join through `deleted_at`? Owner: implementer (locked in `/10x-plan` on S-05, informed by F-01's chosen shape). Block: no.
- **Risk:** this slice closes the Guardrail loop — the recipe collection is the user's core asset, and the cascade rule is what keeps past schedules readable after a delete. Sequenced after S-03 because the cascade can only be exercised once schedules actually exist.
- **Status:** proposed

### S-06: User can delete their most recently generated schedule

- **Outcome:** user can delete the latest entry in their schedule history; the previous schedule becomes "most recent", and the operation can be repeated to clear history one schedule at a time.
- **Change ID:** delete-latest-schedule
- **PRD refs:** FR-010
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** smallest slice; intentionally last under `main_goal: speed`. If the deadline gets tight this is the first candidate to defer (FR-010 is must-have so it cannot Park, but it can be the last shipped).
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID                          | Suggested issue title                                                          | Ready for `/10x-plan` | Notes                                        |
| ---------- | ---------------------------------- | ------------------------------------------------------------------------------ | --------------------- | -------------------------------------------- |
| F-01       | recipes-and-schedules-schema       | Recipes + schedules schema with per-user RLS                                   | yes                   | Run `/10x-plan recipes-and-schedules-schema` |
| S-01       | signed-in-empty-home               | Sign-in lands on a ChickenDinner empty recipe list                             | no                    | Promote when F-01 lands                      |
| S-02       | add-recipe-to-collection           | Add a recipe (name + category) to the user's collection                        | no                    | Promote when S-01 lands                      |
| S-03       | first-generated-schedule           | Generate first 7-day schedule with no consecutive duplicate meals (north star) | no                    | Promote when S-02 lands                      |
| S-04       | category-aware-diversity           | Schedule generator also enforces category diversity                            | no                    | Promote when S-03 lands; parallel with S-05, S-06 |
| S-05       | recipe-edit-delete-with-cascade    | Edit / delete recipe with `[deleted]` cascade in past schedules                | no                    | Promote when S-03 lands; parallel with S-04, S-06 |
| S-06       | delete-latest-schedule             | Delete most recently generated schedule                                        | no                    | Promote when S-03 lands; parallel with S-04, S-05 |

## Open Roadmap Questions

No open cross-cutting questions. PRD's `## Open Questions` section is empty (quality cross-check status `accepted`); per-slice Unknowns above are scoped to their respective `/10x-plan` invocations and none are `Block: yes`.

## Parked

- **Recipe generation / discovery (AI suggestions, recommendation engine, external recipe import).** Why parked: PRD §Non-Goals — the constraint "own recipes only" is the product's differentiating feature.
- **Sharing between users (shared recipe books, collaborative planning, social features).** Why parked: PRD §Non-Goals — data isolation is a hard NFR; sharing would require a fundamentally different access model.
- **Native mobile app.** Why parked: PRD §Non-Goals — web only for MVP; the responsive web app is expected to be usable on mobile browsers.
- **External service integrations (grocery list export, delivery platform, recipe imports from Allrecipes / Cookidoo / etc.).** Why parked: PRD §Non-Goals — integrations add dependency and auth complexity.
- **Recipe search or filter within the collection.** Why parked: PRD §Non-Goals — collection size is expected to be small (~10–20); search is unnecessary at that scale; deferred to v2.
- **Configurable schedule period (3-day, 14-day).** Why parked: PRD §Non-Goals — fixed 7 days simplifies the generation algorithm; flexible period deferred to v2.
- **Manual schedule editing (swap meals in a generated schedule, formerly FR-011).** Why parked: PRD §Non-Goals — partial edit UI risks being worse than no edit at all; deferred to v2.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived. Do NOT pre-populate.)

- **S-01: user can sign up, sign in, sign out, and after signing in see a ChickenDinner-branded landing page that lists their (empty) recipe collection.** — Archived 2026-06-02 → `context/archive/2026-06-02-signed-in-empty-home/`. Lesson: —.
- **S-02: user can open an add-recipe form, supply a name and a category from the closed list of six, and see the recipe in their collection list.** — Archived 2026-06-02 → `context/archive/2026-06-02-add-recipe-to-collection/`. Lesson: —.
- **S-03: user with ≥ 5 recipes presses "generate" and sees an ordered 7-day schedule drawn from their collection, where no two adjacent days share the same meal; the schedule is persisted and visible on revisit.** — Archived 2026-06-04 → `context/archive/2026-06-03-first-generated-schedule/`. Lesson: —.
- **S-04: generate a schedule whose consecutive days also don't share an ingredient category** — Archived 2026-06-04 → `context/archive/2026-06-04-category-aware-diversity/`. Lesson: —.
- **S-06: user can delete the latest entry in their schedule history; the previous schedule becomes "most recent", and the operation can be repeated to clear history one schedule at a time.** — Archived 2026-06-16 → `context/archive/2026-06-04-delete-latest-schedule/`. Lesson: —.
