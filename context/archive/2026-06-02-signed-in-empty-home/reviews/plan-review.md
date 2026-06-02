<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Sign-in lands on a ChickenDinner empty recipe list

- **Plan**: `context/changes/signed-in-empty-home/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-02
- **Verdict**: SOUND
- **Findings**: 0 critical  0 warnings  2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS (2 observations) |

## Grounding

14/14 paths verified (`recipes.astro` is correctly new), 5/5 symbols confirmed (`createClient`, `PROTECTED_ROUTES`, `CATEGORY_LABELS_PL`, `Button`, `Astro.locals.user`), brief↔plan consistent. `bg-cosmic` confirmed as a global `@utility` in `global.css:113`. Blast-radius sweep: both `/dashboard` references outside `dashboard.astro` (`middleware.ts:4`, `Topbar.astro:13`) covered by Phase 1 steps 3 and 5. `PROTECTED_ROUTES` defined only in `middleware.ts`. No existing `/recipes` references.

## Findings

### F1 — Polish plural shorthand will render as literal punctuation

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Change 8 (SignUpForm.tsx)
- **Detail**: Plan proposed "Brakuje jeszcze X znak(ów)" for the password-length hint. The `(ów)` shorthand is not Polish idiom and renders literally on screen. Polish has three plural forms: 1 → "znak", 2–4 → "znaki", 5+ → "znaków". All three are reachable since the hint shows for lengths 1–5 (MIN_PASSWORD_LENGTH=6).
- **Fix**: Replace `(ów)` shorthand with a real plural fork: `remaining === 1 ? "znak" : remaining < 5 ? "znaki" : "znaków"`. Full phrase: `"Brakuje jeszcze ${remaining} ${pluralForm}"`.
- **Decision**: DISMISSED — user disagreed; implementer will handle Polish plural logic during implementation.

### F2 — Topbar retention in Welcome.astro was implicit, not stated

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Change 2 (Welcome.astro)
- **Detail**: Plan said to keep cosmic background, drop feature cards, keep hero CTAs — but did not mention `<Topbar />`. An implementer rewriting Welcome.astro from scratch could drop it since the hero already has sign-in/sign-up buttons. Phase 2 Step 3 implied Topbar is still visible on `/` ("in both states") but that link was easy to miss.
- **Fix**: Added sentence to Phase 2 Change 2 Contract: "Retain the `<Topbar />` component at the top of the page content div — it is the canonical nav for both guest and signed-in states on every surface."
- **Decision**: FIXED — note added to plan.
