<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Sign-in lands on a ChickenDinner empty recipe list

- **Plan**: context/changes/signed-in-empty-home/plan.md
- **Scope**: Full plan (Phase 1 + Phase 2)
- **Date**: 2026-06-02
- **Verdict**: APPROVED
- **Findings**: 0 critical · 1 warning · 2 observations

## Verdicts

| Dimension            | Verdict |
|----------------------|---------|
| Plan Adherence       | WARNING |
| Scope Discipline     | PASS    |
| Safety & Quality     | PASS    |
| Architecture         | PASS    |
| Pattern Consistency  | WARNING |
| Success Criteria     | PASS    |

## Grounding

- Plan-vs-diff drift detection across 14 planned items: 14/14 satisfied at the content level; 1 component-contract deviation (F1).
- Safety scan: Supabase null-check present, no XSS via auto-escaped interpolation, signin redirect is hardcoded internal path, no Node-only APIs, RLS-scoped SELECT only.
- Automated success criteria re-run: `npm run lint` (clean), `npx prettier --check` on all 13 changed files (clean), residual-English grep (no matches), `npm run build` (clean).
- Manual success criteria: all `[x]` in `## Progress` of plan.md.

## Findings

### F1 — Disabled CTA uses plain `<button>`, plan specified shadcn Button

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/recipes.astro:32-38 (pre-fix)
- **Detail**: Plan contract (plan.md:74 and :41) specified `Button` from `@/components/ui/button` with `disabled` and `title="wkrótce"`. Implementation used hand-styled plain `<button disabled>` with manual Tailwind. Functional behaviour was correct but the component contract was bypassed; this becomes consistency debt against the S-02 add-form which will pull shadcn Button in anyway.
- **Fix A ⭐ Recommended**: Swap to shadcn `Button`
  - Strength: Restores plan contract; aligns with S-02; mechanical change; ships static HTML (no client directive).
  - Tradeoff: Negligible — shadcn Button renders to static markup when no event handlers bind.
  - Confidence: HIGH — Button already present, swap is mechanical.
  - Blind spot: None significant.
- **Fix B**: Amend plan to document deviation
  - Strength: Preserves shipped code; zero churn.
  - Tradeoff: Drift becomes precedent.
  - Confidence: MEDIUM.
  - Blind spot: Future cherry-picking of plan deviations.
- **Decision**: FIXED via Fix A (shadcn Button swap + import added; verified by lint + prettier + build).

### F2 — Cosmic shell diverges between Welcome and recipes

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/recipes.astro:21-23 vs src/components/Welcome.astro:5-25 (pre-fix)
- **Detail**: Welcome.astro retains the full cosmic shell (bg-cosmic + 3 orbs + star-field + Topbar). recipes.astro had only bg-cosmic + Topbar — orbs and star-field were missing despite the plan calling for the full pattern from Welcome/dashboard. Visual identity drifted between landing and post-signin home.
- **Fix**: Copy orbs + star-field markup into recipes.astro; defer shared `<CosmicShell>` extraction to a later slice when a third surface needs it.
- **Decision**: FIXED (orbs + star-field markup copied verbatim; verified by lint + prettier + build).

### F3 — Polish plural shorthand is bounded-range-correct but undocumented

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/auth/SignUpForm.tsx:57-62
- **Detail**: `remaining === 1 ? "znak" : remaining <= 4 ? "znaki" : "znaków"` is correct for `remaining ∈ [1, 5]` (`MIN_PASSWORD_LENGTH = 6`). Standard Polish rule misclassifies 12–14 as "znaki" with this shorthand, but that range is unreachable. If `MIN_PASSWORD_LENGTH` ever bumps past 11, this silently breaks.
- **Fix**: Add a one-line comment noting the bounded-range assumption.
- **Decision**: SKIPPED — bounded range makes the simple form correct here; reviewer accepted the residual risk.
