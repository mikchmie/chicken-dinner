# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-16

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/` (excluding docs, fixtures, archive, build output).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Generator violates its best-effort contract: on a too-small or category-skewed collection it crashes, refuses, or returns an invalid schedule (a day unassigned, a meal drawn from outside the user's collection) instead of "the most varied schedule possible." | High | High | PRD §Business Logic ("best-effort, never refuses"), US-01 AC; interview Q1; hot-spot `src/lib/services` (4 commits/30d) |
| 2 | Diversity invariant regresses silently: a generator refactor produces consecutive same-meal or same-category days while the lone unit test stays green (untested edges — ties, exhausted categories, exactly 7 recipes, duplicates). | High | High | US-01 AC, PRD §Success Criteria (Secondary), FR-008 (category clause); interview Q2; hot-spot `src/lib/services` |
| 3 | Cross-user data leakage: user B reads or deletes user A's recipe or schedule via an RLS regression or a missing ownership check on the schedule-by-id endpoint — the SQL isolation harness is not run in CI, so a regression lands silently. | High | Medium | PRD §Non-Functional Requirements (data isolation), §Access Control; interview Q4; hot-spot `supabase/migrations`; abuse lens (IDOR / authorization) |
| 4 | Schedule-creation RPC guard change corrupts, duplicates, or writes a malformed schedule for existing rows or edge inputs (SECURITY DEFINER logic behaves unexpectedly). | High | Medium | PRD §Guardrails (data integrity), FR-008; interview Q3; hot-spot `supabase/migrations` (4 commits/30d) |
| 5 | Recipe-add server validation accepts an out-of-list category or malformed recipe because the validation contract and the database enum drift, poisoning the diversity signal and downstream generation. | Medium | Medium | FR-005, roadmap S-02 (enum single-source-of-truth unknown); hot-spot `src/lib`; abuse lens (untrusted input / server-validation parity) |
| 6 | Recipe delete cascade fails the `[deleted]` contract: deleting a recipe referenced by a past schedule breaks or empties the schedule view instead of rendering `[deleted]` for that slot. | High | Medium | PRD §Guardrails, FR-007; roadmap S-05 (`proposed`); F-01 cascade-shape unknown |

**Impact × Likelihood rubric.** Score both axes on a coarse High / Medium /
Low scale so two readers agree on the same row.

| Rating | Impact | Likelihood |
|--------|--------|------------|
| High   | user loses access, data, or money; failure is publicly visible | area changes weekly, or we have already been burned here |
| Medium | feature degrades, a workaround exists, only some users affected | touched occasionally, has been a source of bugs |
| Low    | cosmetic, easily reverted, no data effect | stable code, rarely touched |

Order rows by impact × likelihood. Protect High × High first; High-impact ×
Low-likelihood scenarios usually belong to observability/alerting, not a test.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | For 1-recipe / 3-recipe / single-category inputs the generator returns exactly 7 ids, throws nothing, and draws only from the collection; for the empty collection it returns `[]` (guarded upstream at the endpoint) — do not assert 7 days for empty | "fewer than 7 recipes" is an error case — it is not; the PRD mandates best-effort. Also: the crash mode is already defended by the fallback tier, so these tests are regression insurance, not bug-finding | the generator entry point, the input shape, the empty-input contract, and how degradation is ordered when the rule cannot be fully satisfied | unit | happy-path-only fixtures (always ≥7 balanced recipes) |
| #2 | The HARD invariant holds unconditionally for n≥2 (no two consecutive days share a meal); the SOFT objective is proven only as the relaxation-order guarantee (a category-differing recipe is chosen whenever a both-different candidate exists), asserted over many runs to beat the randomized tie-break | the single green unit test proves the algorithm is correct; AND that the soft objective can be asserted as an optimum — it cannot, the algorithm is greedy + randomized, not optimal | the exact diversity objective, the tie-break / relaxation order, and that the only non-determinism is an un-seeded random tie-break (no injectable seam) | unit (table- or property-driven, multi-run) | oracle problem in two forms — (a) assertions lifted from the implementation's own output, (b) asserting a combinatorial optimum the greedy algorithm need not reach (flaky) |
| #3 | A request from user B for user A's resource returns empty or 403 and writes nothing | "authenticated" implies "authorized for this id" | the RLS policies, the SECURITY DEFINER RPC, and the ownership check on the schedule-by-id endpoint | integration (plus wiring the existing SQL isolation harness) | testing only the same-user happy path |
| #4 | The RPC writes exactly one well-formed schedule with its day rows; malformed input is rejected and existing rows are untouched | a 200 / success status means the persisted rows are correct | the RPC contract, its guard conditions, and the persisted row shape | integration | asserting the status only, never the persisted side-effect |
| #5 | The server rejects any category outside the closed list of six and any malformed payload, regardless of what the client sent | client-side validation implies the server is safe | the category enum source of truth and where the API actually validates input | integration | over-mocking the validation layer so the real contract is never exercised |
| #6 | A schedule referencing a deleted recipe still renders `[deleted]` for that slot and never errors or drops the day | delete "works" because the recipe row is gone | the chosen cascade shape (FK nulled and rendered, vs. soft-delete with `deleted_at`) | integration | snapshot test that does not assert the `[deleted]` slot specifically |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Generator correctness & robustness | Defend the north-star algorithm at the cheapest layer — invariants and best-effort degradation on adversarial inputs | #1, #2 | unit | complete | context/changes/testing-generator-correctness/ |
| 2 | Data-isolation & RPC integrity | Prove cross-user isolation and correct schedule-RPC writes; wire the dormant SQL isolation harness | #3, #4 | integration + SQL harness | not started | — |
| 3 | API contract & input validation | Server rejects out-of-list categories and malformed payloads, and enforces ownership on schedule endpoints | #5, #3 (IDOR slice) | integration | not started | — |
| 4 | Recipe delete-cascade safety | The `[deleted]` contract holds in past schedules; ships with roadmap S-05 | #6 | integration | not started | — |

**Status vocabulary** (fixed — parser literals):

| Value | Meaning |
|----------------|----------------------------------------------------------------------------------|
| `not started`  | No change folder for this rollout phase yet. |
| `change opened` | `context/changes/<id>/` exists with `change.md`; research not done. |
| `researched`   | `research.md` exists in the change folder. |
| `planned`      | `plan.md` exists with a `## Progress` section. |
| `implementing` | Progress section has at least one `[x]` and at least one `[ ]`. |
| `complete`     | Progress section is fully `[x]`. |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|----------------------|----------------------------|---------|--------------------------------------|
| unit + integration | Vitest | ^4.1.8 | configured; `npm test` runs `vitest run`. One test today: `src/lib/services/schedule-generator.test.ts`. Profile: **sparse**. |
| RLS / DB isolation | Supabase SQL test harness | n/a | `supabase/tests/rls_isolation.sql` exists but is **not wired into CI** — see §3 Phase 2. |
| API mocking | none yet — see §3 Phase 2/3 | — | Integration tests will exercise endpoints against the local Supabase stack rather than mocking internals. |
| e2e | none — intentionally omitted | — | Every top risk is catchable at unit or integration layer; no risk requires the full deployed browser path. |
| AI-native | none — intentionally omitted | — | Diversity ("feels varied") is deterministically checkable (no-consecutive-category); an LLM judge would add cost without signal. Product has no AI features. |

**Stack grounding tools (current session):**
- Docs: none (no Context7 / framework docs MCP exposed); `WebFetch` available as a fallback for current Vitest/Supabase docs; checked: 2026-06-16
- Search: none (no Exa.ai); `WebSearch` available; checked: 2026-06-16
- Runtime/browser: none (no Playwright MCP) — not used; e2e omitted by design; checked: 2026-06-16
- Provider/platform: none (no Supabase/Cloudflare MCP — skills only, not live tools); local manifests/configs used instead; checked: 2026-06-16

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|-------------------------------|-------------------|------------------------------|-----------------------------------------------|
| lint + typecheck | local + CI | required | syntactic / type drift |
| unit + integration | local + CI | required after §3 Phase 1 | generator and logic regressions |
| RLS isolation (SQL harness) | CI on PR | required after §3 Phase 2 | cross-user data leakage regressions |
| pre-prod smoke (live URL hit) | between merge + prod | recommended | Cloudflare runtime-only failures (see `lessons.md`) |

e2e, post-edit hooks, and visual review are deliberately not listed — no rollout phase points at them, so listing them would be aspirational.

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test (generator and pure logic)

**Location**: `src/lib/services/` — co-locate the test file with the source under test. No
separate `__tests__` directory.

**Naming**: `<source-file>.test.ts` — e.g., `schedule-generator.test.ts`.

**Run command**: `npm test` (runs `vitest run`).

**Reference test**: `src/lib/services/schedule-generator.test.ts` — the
`describe("hard invariant — no adjacent same meal, multi-run")` block is the canonical
example of the multi-run invariant pattern.

---

**Pattern 1 — Best-effort contract (boundary sizes)**

One `describe` block per contract boundary. Use `makeRecipes(n)` for single-category
fixtures. Loop ≥ 100 runs for n-boundary tests; assert length and set-containment inside
the loop. Pin degenerate cases (`n = 0`) with a single deterministic assertion — do not
apply the 7-day length expectation to the empty case.

```ts
describe("best-effort contract — boundary sizes", () => {
  it("returns [] for an empty collection", () => {
    expect(generateSchedule([])).toEqual([]);
  });

  it("returns 7 ids from the collection across 100 runs (n=2)", () => {
    const recipes = makeRecipes(2);
    const ids = new Set(recipes.map((r) => r.id));
    for (let i = 0; i < 100; i++) {
      const result = generateSchedule(recipes);
      expect(result).toHaveLength(7);
      result.forEach((id) => expect(ids.has(id)).toBe(true));
    }
  });
});
```

**Pattern 2 — Hard invariant, multi-run**

Loop ≥ 100 runs on adversarial sizes (`n = 2` forces strict alternation; `n = 7` is the
distinct-vs-repeat boundary). Assert the adjacency invariant inside the loop — a
single-run check can miss violations reachable only on certain `Math.random()` tie-breaks.
Do not seed or patch `Math.random()`; looping is the correct neutralisation technique.

```ts
describe("hard invariant — no adjacent same meal, multi-run", () => {
  it("has no adjacent same meal across 100 runs (n=2)", () => {
    const recipes = makeRecipes(2);
    for (let i = 0; i < 100; i++) {
      const result = generateSchedule(recipes);
      for (let d = 1; d < result.length; d++) {
        expect(result[d]).not.toBe(result[d - 1]);
      }
    }
  });
});
```

**Pattern 3 — Category scarcity / relaxation-order guarantee**

Use a skewed fixture (majority category + small minority) to exercise the T1 tier under
pressure. Since the fixture is multi-category, T1 is always non-empty → zero adjacent
same-category pairs is the correct oracle (not a combinatorial minimum). Loop ≥ 100 runs.
Assert both the hard (no adjacent same meal) and soft (no adjacent same category) invariants.

```ts
function makeRecipesSkewed(): RecipeSlot[] {
  return [
    { id: "c0", category: "chicken" }, { id: "c1", category: "chicken" },
    { id: "c2", category: "chicken" }, { id: "c3", category: "chicken" },
    { id: "c4", category: "chicken" },
    { id: "p0", category: "pork" },   { id: "p1", category: "pork" },
  ];
}

describe("category-aware diversity — scarcity", () => {
  it("has no adjacent same-category days across 100 runs (skewed collection)", () => {
    const recipes = makeRecipesSkewed();
    const categoryOf = new Map(recipes.map((r) => [r.id, r.category]));
    for (let i = 0; i < 100; i++) {
      const result = generateSchedule(recipes);
      for (let d = 1; d < result.length; d++) {
        expect(categoryOf.get(result[d])).not.toBe(categoryOf.get(result[d - 1]));
      }
    }
  });
});
```

**Anti-patterns to avoid**:
- Asserting 7 days for the empty (`n = 0`) case — the contract is `→ []`.
- Single-run invariant assertions — tie-break violations can be invisible on one draw.
- Asserting a combinatorial minimum of same-category adjacencies — the algorithm is greedy
  + randomized, not optimal; that oracle is flaky on correct output.
- Assertions lifted from the implementation's own output (oracle problem).

### 6.2 Adding an integration test (Supabase-backed)

TBD — see §3 Phase 2 (RLS isolation + schedule-RPC write verification against the local Supabase stack).

### 6.3 Adding a test for a new API endpoint

TBD — see §3 Phase 3 (request → response shape, server-side validation parity, and ownership/IDOR check pattern).

### 6.4 Adding a cascade / data-integrity test

TBD — see §3 Phase 4 (`[deleted]` contract for recipes referenced by past schedules).

### 6.5 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note here capturing anything surprising the rollout phase taught.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Config-status banner and degradation copy** — low blast radius, no data effect. Re-evaluate if config status starts gating real functionality. (Source: Phase 2 interview Q5.)
- **Auth flows themselves (sign-in / sign-up / sign-out)** — starter + Supabase code, not project logic. Re-evaluate if the auth flow is customised beyond the starter. (Source: Phase 2 interview Q5 + tech-stack.md.)
- **Astro page markup / shadcn UI snapshots** — brittle on Tailwind tweaks, catch little. Re-evaluate if a page grows non-trivial client logic. (Source: Phase 2 interview Q5.)
- **Cloudflare `disable_nodejs_process_v2` runtime bug** — caught by a live-URL deploy check, not a unit test. (Source: `context/foundation/lessons.md`.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-16
- Stack versions last verified: 2026-06-16
- AI-native tool references last verified: 2026-06-16

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
