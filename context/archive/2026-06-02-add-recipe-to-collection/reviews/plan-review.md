<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Add Recipe to Collection (S-02)

- **Plan**: `context/changes/add-recipe-to-collection/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-02
- **Verdict before triage**: REVISE
- **Verdict after triage**: SOUND
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

5/5 paths ✓, 4/4 symbols ✓, brief↔plan ✓
Button.asChild ✓, useFormStatus ✓, lucide icons (UtensilsCrossed/Plus/CircleAlert) present ✓

## Findings

### F1 — Whitespace-only names accepted server-side

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real client/server mismatch; one-line fix
- **Dimension**: Blind Spots
- **Location**: Phase 1 #2 (`src/lib/schemas.ts`) + Phase 2 #4 (`validate()`)
- **Detail**: Client `validate()` checks `name.trim()` non-empty (Phase 2 #4), but `RecipeCreateSchema` uses `z.string().min(1, ...)` — no `.trim()`. The DB CHECK `char_length(name) between 1 and 200` also accepts whitespace. A POST with `name=   ` (JS disabled or direct curl) bypasses client validation and inserts a whitespace-only row.
- **Fix**: Change schema to `z.string().trim().min(1, ...)` so `.trim()` runs before the length check; `"   "` becomes `""` and fails `min(1)`.
  - Strength: One-line edit closes the mismatch.
  - Tradeoff: Names with intentional leading/trailing spaces get trimmed silently.
  - Confidence: HIGH — standard zod pattern.
- **Decision**: DISMISSED (user disagreed with the finding)

### F2 — Phase 3 leaves unused `Button` import; lint will fail

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; obvious fix
- **Dimension**: Plan Completeness
- **Location**: Phase 3 #6 contract
- **Detail**: `src/pages/recipes.astro:4` imports `Button` and uses it only inside the disabled empty-state CTA (line 54). Phase 3 removes the only `<Button>` usage. ESLint `@typescript-eslint/no-unused-vars: "error"` (`eslint.config.mjs:25`) will fail `npm run lint` (Success Criterion 3.1).
- **Fix A**: Use `<Button asChild><a href="/recipes/new">Dodaj przepis</a></Button>` in the heading row — keeps the import alive, leverages radix Slot.
  - Strength: No import removal step needed.
  - Tradeoff: Extra wrapper; shadcn `Button` default variant doesn't use purple, so the same purple class string still ends up applied inline.
  - Confidence: HIGH — verified Button.asChild support.
- **Fix B ⭐**: Add an explicit "remove `import { Button }` line" step to Phase 3 contract and keep the raw `<a>`.
  - Strength: One fewer wrapper; raw `<a>` is the simpler chunk of code.
  - Tradeoff: The purple class string lives only in `recipes.astro` (already duplicated in `SubmitButton.tsx` regardless).
  - Confidence: HIGH.
- **Decision**: FIXED via Fix B — plan.md Phase 3 #6 now instructs to remove the unused `import { Button }` line.

### F3 — WebKit native `<select>` dropdown popup looks light against cosmic background

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Blind Spots
- **Location**: Phase 2 #4 (category select)
- **Detail**: Plan applies `appearance-none` to the closed `<select>` and `className="bg-gray-900"` to each `<option>`. Safari/Chrome on macOS render the open dropdown using native OS chrome that ignores `<option>` background styling. Closed control matches cosmic theme; opened list looks light/native.
- **Fix**: Note in plan-brief Open Risks, accept as MVP limitation. Swap to shadcn `Select` if it becomes jarring.
- **Decision**: ACCEPTED — plan-brief.md Open Risks now includes a note about the open-state popup styling.

### F4 — Server-validation redirect loses user input

- **Severity**: 💭 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Blind Spots
- **Location**: Phase 1 #3 (POST `/api/recipes` error path)
- **Detail**: On validation error the API redirects to `/recipes/new?error=...` and the form re-renders empty — user retypes name and reselects category. Rare in practice (client-side validation catches these first) but matters for JS-disabled or direct-API submitters.
- **Fix**: Echo `name` and `category` back via query params, or accept as parity with the existing auth `?error=` pattern (which also loses input).
- **Decision**: SKIPPED — handle later if it becomes a real problem.

## Triage summary

- **Fixed**: F2 (Fix B applied)
- **Accepted**: F3 (noted in Open Risks)
- **Skipped**: F4
- **Dismissed**: F1
- **Verdict after triage**: SOUND
