# Frame Brief: Data-isolation & RPC integrity (test-plan Phase 2)

> Framing step before /10x-plan. This document captures what is _actually_
> at issue, separated from what was initially assumed.

## Reported Observation

`/10x-e2e testing-data-isolation phase 2` was invoked to drive browser-level
(Playwright) test generation for "phase 2" of data isolation testing. No
change folder, research, or plan existed for this phase — `/10x-e2e`'s own
setup step could not resolve `context/changes/testing-data-isolation/plan.md`.

`context/foundation/test-plan.md` §3 already defines this work as **Phase 2:
Data-isolation & RPC integrity** (risks #3 cross-user leakage, #4 RPC write
integrity), scoped as **test types: `integration + SQL harness`** — not e2e.
§4/§5 state project-wide that e2e is "**none — intentionally omitted**":
"every top risk is catchable at unit or integration layer; no risk requires
the full deployed browser path."

## Initial Framing (preserved)

- **User's stated cause or approach**: implicit in the command — that phase 2
  (data isolation / RPC integrity) should be tested via E2E/browser-driven
  Playwright tests.
- **User's proposed direction**: run `/10x-e2e`'s plan→generate→review→verify
  loop to produce browser tests for this phase.
- **Pre-dispatch narrowing**: user confirmed they reached for `/10x-e2e` out
  of habit / to exercise the E2E skill itself, not a deliberate judgment that
  this risk needs browser coverage — and was **not sure** of any specific
  browser-only failure mode (vs. the concern being purely "does user B ever
  see/write user A's data").

## Dimension Map

The scope question — E2E vs. integration+SQL for phase 2 — could resolve at
any of these dimensions:

1. **Risk mechanism** — do risks #3/#4 manifest somewhere only observable in
   a rendered browser session (client cache, stale UI state), or entirely at
   the API/DB layer?
2. **Existing test infra** — is there already a lower-cost mechanism
   (`supabase/tests/rls_isolation.sql`) built for exactly this, just not
   wired into CI? ← initial framing would bypass this
3. **Convention** — how was test-plan Phase 1 executed, and does the
   project's own rollout pattern ever call for e2e?
4. **Staleness of the "e2e omitted" decision** — has anything shipped since
   test-plan.md's last review (2026-06-16) that would introduce a
   browser-only cross-user leak surface?

## Hypothesis Investigation

| Hypothesis                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Verdict               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| #1: Risk needs browser observation   | No `localStorage`/`sessionStorage`/module cache in `src/components` or `src/pages/**/*.astro` (grep clean); all React state is local form/UI state (`SignInForm.tsx`, `SignUpForm.tsx`, `AddRecipeForm.tsx`, `DeleteScheduleButton.tsx`). `src/pages/api/schedules/[id].ts` is a server route testable via direct HTTP POST — no browser needed. RPC `create_schedule` (`supabase/migrations/20260531173036_create_schedule_rpc.sql`) is directly callable via `supabase.rpc(...)`.                                       | NONE                  |
| #2: Cheaper mechanism already exists | `supabase/tests/rls_isolation.sql` (156 lines, pgTAP) already tests cross-user read (T2), cross-user UPDATE returning 0 rows (T4), cross-user `schedule_days` read (T5), and anon zero-row checks (T6-T8) — exactly risk #3's shape. Confirmed **not wired into CI** (test-plan.md:125). Gaps found: no DELETE test, no `schedules`-table write/insert isolation test. RLS policies in `supabase/migrations/20260531164345_...sql` scope `recipes`/`schedules`/`schedule_days` by `auth.uid() = user_id` (L82-115).       | STRONG                |
| #3: Convention favors integration    | Phase 1 ("Generator correctness & robustness") shipped via the standard `/10x-new → /10x-research → /10x-plan → /10x-implement` chain with **unit** tests (`context/archive/2026-06-16-testing-generator-correctness/`), matching its test-plan row — no phase in this project's history has used `/10x-e2e`.                                                                                                                                                                                                             | STRONG                |
| #4: Decision is stale                | `git log --since=2026-06-16` shows only 3 commits, none touching `src/pages`, `src/components`, `src/middleware.ts`, `supabase/migrations`, or `supabase/tests` (one added the `.claude/skills/10x-e2e/` skill itself, not app code). All isolation-relevant files (schema, RLS, RPC, pages, middleware, `rls_isolation.sql`) are dated May 31, 2026 — unchanged since before the test-plan review. `roadmap.md:175` explicitly parks cross-user sharing as a non-goal, so no new cross-user data path is planned either. | NONE (decision holds) |

## Narrowing Signals

- User confirmed the E2E command was habit-driven, not a deliberate override
  of the test-plan's scoping.
- User was not sure of any browser-only failure mode — and the investigation
  found none exists in the current codebase (no client-side cross-user
  state).
- The dormant `rls_isolation.sql` harness already covers most of risk #3's
  shape at a fraction of E2E's cost — the test-plan's own "wire the dormant
  SQL isolation harness" instruction (§3 Phase 2) is directly actionable
  today.

## Cross-System Convention

Every prior test-plan rollout phase in this project used the
`/10x-new → /10x-research → /10x-plan → /10x-implement` (or `/10x-tdd`)
chain, matching the test type the risk map assigned. `/10x-e2e` has never
been used for a rollout phase here, and its own eligibility gate would
redirect this phase anyway (`10x-e2e`'s "Browser-level fit check" explicitly
lists "A single endpoint's status/shape/auth/gating contract" and "Anything
an isolated function or integration test can prove" as **not** E2E-worthy —
which is exactly risks #3/#4's shape).

One incidental finding worth flagging for `/10x-research`: test-plan.md row
#4 describes the schedule-creation RPC as "SECURITY DEFINER," but the actual
migrations (`20260531173036_...sql:11`, `20260531180052_...sql:16`) declare
it `security invoker`. Doesn't change the framing, but the plan/research step
should correct this detail rather than repeat it.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: execute test-plan.md's Phase 2
> exactly as already scoped — integration tests against the local Supabase
> stack for the schedule-by-id ownership check and the `create_schedule` RPC
> guards, plus wiring the existing `supabase/tests/rls_isolation.sql` harness
> into CI (extending it to cover DELETE and `schedules`-table write
> isolation, which it's currently missing).

The initial framing (E2E) was not correct — not because the risk is
unimportant, but because the tool doesn't fit: every mechanism involved
(RLS, RPC, ownership check) is server/DB-side and already has a cheaper,
existing test seam. Nothing in the codebase or recent history introduces a
browser-only leak surface that would justify the added cost and flakiness of
Playwright here. This is a case where `/10x-e2e`'s own eligibility gate would
have redirected the work — this frame just catches it one step earlier.

## Confidence

**HIGH** — strong evidence on both supporting hypotheses (existing harness,
convention), no evidence for the browser-necessity or staleness hypotheses,
and a decisive narrowing signal (user confirms the E2E reach was habit, not
judgment).

## What Changes for /10x-plan

Plan phase 2 as an **integration** rollout: (1) wire
`supabase/tests/rls_isolation.sql` into CI, extending it to cover DELETE and
`schedules` write/insert isolation; (2) add integration tests against the
local Supabase stack for `src/pages/api/schedules/[id].ts`'s ownership
behavior and the `create_schedule` RPC's write guards (per test-plan.md
Risk Response Guidance rows #3/#4). No Playwright/E2E work belongs in this
phase.

## References

- Source files: `context/foundation/test-plan.md:44,67-68,81,104,125,237`;
  `supabase/tests/rls_isolation.sql`;
  `supabase/migrations/20260531164345_create_recipes_schedules_schema.sql:77-115`;
  `supabase/migrations/20260531173036_create_schedule_rpc.sql:11`;
  `supabase/migrations/20260531180052_fix_create_schedule_guards.sql:16`;
  `src/pages/api/schedules/[id].ts`; `context/foundation/roadmap.md:175`
- Related research: none yet — `/10x-research` has not run for this change
- Investigation: two parallel read-only Explore agents (RLS/SQL-harness
  state; post-test-plan codebase changes), no TaskCreate entries registered
