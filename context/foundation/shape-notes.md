---
project: ChickenDinner
context_type: greenfield
created: 2026-05-24
updated: 2026-05-24
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: "2026-07-05"
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain type"
      decision: "diet monotony / habit rut — app enforces variety user can't enforce themselves"
    - topic: "primary persona"
      decision: "the developer themselves (solo home cook with existing recipe repertoire)"
    - topic: "core insight"
      decision: "works from known recipes only; diversity enforced algorithmically"
    - topic: "auth model"
      decision: "login (email + password or OAuth); flat user model — each account sees only their own data"
    - topic: "MVP timeline"
      decision: "3 weeks of after-hours work; flow: sign-up → add recipes → generate 7-day schedule → view plan"
    - topic: "recipe schema"
      decision: "minimum: name + category/tag; diversity algorithm uses category as a signal"
    - topic: "recipe deletion cascade"
      decision: "past schedules show '[deleted]' for any slot referencing a removed recipe"
    - topic: "schedule period"
      decision: "fixed at 7 days for MVP; configurable period is v2"
    - topic: "schedule edit (FR-011)"
      decision: "dropped from MVP; explicitly deferred to v2"
    - topic: "recipe list UI"
      decision: "flat list; search deferred to v2; noted in non-goals"
  frs_drafted: 10
  quality_check_status: accepted
---

## Vision & Problem Statement

A home cook with an established recipe repertoire keeps falling back to the same 5–10 familiar meals — not from lack of knowledge, but from decision fatigue at planning time. The cost is meal monotony and the mental overhead of manually tracking "what did I have last week?" so as not to repeat it.

The insight: existing meal apps are recipe discovery engines or nutrition trackers — neither serves the user who wants variety within a known set. This app works exclusively with recipes the user already knows and enforces diversity algorithmically, so the system tracks repetition history and the user doesn't have to.

## User & Persona

**Primary persona:** The developer — a solo home cook with an established collection of known recipes who wants a varied dinner schedule generated automatically from that collection, without needing to discover new recipes or track nutrition.

## Access Control

Login required (email + password or OAuth). Flat user model — each registered user sees only their own recipes and schedules. No admin role, no shared data, no role separation in MVP. Sign-up creates an account; sign-in restores the user's personal recipe and schedule data.

## Functional Requirements

### Authentication
- FR-001: User can create an account with email and password. Priority: must-have
  > Socrates: No counter-argument surfaced; FR stands as written.
- FR-002: User can sign in to their account. Priority: must-have
  > Socrates: No counter-argument surfaced; FR stands as written.
- FR-003: User can sign out of their account. Priority: must-have
  > Socrates: No counter-argument surfaced; FR stands as written.

### Recipe Management
- FR-004: User can view their personal recipe collection. Priority: must-have
  > Socrates: Counter-argument considered: "a flat list breaks down above ~20 recipes without search." Resolution: flat list accepted for MVP; recipe search explicitly deferred to v2 and recorded in non-goals.
- FR-005: User can add a recipe (name + category/tag) to their collection. Priority: must-have
  > Socrates: Counter-argument considered: "undefined recipe schema means the add form can balloon." Resolution: minimum schema fixed at name + category/tag; keeps the form bounded and gives the diversity algorithm a signal beyond name alone.
- FR-006: User can edit a recipe in their collection. Priority: must-have
  > Socrates: Counter-argument considered: "delete-and-re-add covers the same need at zero extra UI cost." Resolution: kept as must-have; explicit edit is preferred over the delete-and-re-add workaround.
- FR-007: User can delete a recipe from their collection. Priority: must-have
  > Socrates: Counter-argument considered: "deleting a recipe that appears in a saved schedule creates a data integrity problem." Resolution: deletion cascades — past schedules show '[deleted]' for that slot.

### Schedule Management
- FR-008: User can generate a 7-day dinner schedule from their recipe collection. Priority: must-have
  > Socrates: Counter-argument considered: "a fixed 7-day period is arbitrary — 3- or 14-day schedules would serve different planning styles." Resolution: 7 days kept fixed for MVP; configurable period deferred to v2 and noted in non-goals.
- FR-009: User can view their previously generated schedules. Priority: must-have
  > Socrates: No counter-argument surfaced; FR stands as written.
- FR-010: User can delete their most recently generated schedule. Priority: must-have
  > Socrates: Counter-argument considered: "old schedules accumulate with no way to bulk-clear them." Resolution: counter-argument dismissed — delete-latest is a stack operation; repeating it clears all history incrementally. The prior schedule becomes latest after each deletion.
- ~~FR-011: User can edit a generated schedule by swapping meals. Priority: nice-to-have~~ — **dropped from MVP; deferred to v2.**
  > Socrates: Counter-argument: "a nice-to-have item at 80% done at ship time is worse than 0% — partial edit UI erodes trust." Resolution: FR-011 explicitly removed from MVP scope. Noted as v2 item in non-goals.

## Business Logic

The schedule generator selects 7 meals from the user's recipe collection such that no two consecutive days share the same meal, and minimises clustering of the same base-ingredient category across the week.

The rule consumes two user-facing inputs per recipe: its name and its base-ingredient category, chosen from a fixed closed list of six — chicken, pork, beef, leguminous, eggs, vegetables. The output is an ordered 7-day sequence of meals drawn exclusively from the user's own collection. The user encounters the rule by pressing "generate" and receiving the plan; the algorithm's decisions are invisible.

When the collection is too small or category-unbalanced to fully satisfy the diversity rule, the algorithm produces the most varied schedule possible on a best-effort basis and never refuses to generate.

## Non-Functional Requirements

- Each user's recipe collection and generated schedules are readable only by that user. No cross-account data access is possible — user A cannot read, infer, or affect user B's data under any circumstances.

## User Stories

### US-01: User generates a 7-day dinner schedule

- **Given** a signed-in user with at least 5 recipes in their collection
- **When** they request a 7-day schedule
- **Then** they see a schedule with a different dinner assigned to each day, drawn exclusively from their own recipe collection

#### Acceptance Criteria
- No two consecutive days in the schedule have the same meal assigned
- Each of the 7 days has a meal assigned

## Success Criteria

### Primary
- A user can sign up, add their recipes, request a 7-day dinner schedule, and receive a varied plan — end-to-end, without error.

### Secondary
- The generated schedule feels varied — no two consecutive days share a category (base ingredient) as well as a meal.

### Guardrails
- A recipe the user has saved must never disappear or be corrupted. The recipe collection is the user's core asset; data integrity loss is an unconditional failure regardless of other functionality.

## Non-Goals

- **No recipe generation or discovery.** The app works exclusively from recipes the user already knows and has added manually. No AI suggestions, no recommendation engine, no import from external recipe sources. Rationale: the constraint (own recipes only) is the product's differentiating feature.
- **No sharing between users.** Recipes and schedules are private per account. No shared recipe books, no collaborative planning, no social features. Rationale: data isolation is a hard NFR; sharing would require a fundamentally different access model.
- **No mobile app for MVP.** Web browser only. The web app should be usable on mobile browsers, but no native iOS/Android app, no app-store release. Rationale: stated in seed notes; reduces platform scope.
- **No external service integrations.** No grocery list export, no delivery platform hookup, no recipe import from Allrecipes / Cookidoo / etc. Rationale: stated in seed notes; integrations add dependency and auth complexity.
- **No recipe search or filter within the collection.** Flat list only for MVP; search is v2. Rationale: collection size is expected to be small (~10–20 recipes); search is unnecessary at that scale.
- **No configurable schedule period.** Schedule is always 7 days. Rationale: hardcoded period simplifies the generation algorithm; flexible period deferred to v2.
- **No manual schedule editing.** Generated schedules are read-only in v1. Rationale: FR-011 explicitly deferred; partial edit UI risks being worse than no edit at all.

## Quality cross-check

All six greenfield elements passed.
One inconsistency resolved during cross-check: Secondary success criterion replaced from "user can edit schedule" (v2 non-goal) to category-diversity criterion, grounded in the algorithm's actual capability.
Status: accepted.
