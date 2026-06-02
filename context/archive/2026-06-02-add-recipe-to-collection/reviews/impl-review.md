<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Add Recipe to Collection (S-02)

- **Plan**: context/changes/add-recipe-to-collection/plan.md
- **Scope**: Full plan (Phases 1–3)
- **Date**: 2026-06-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 2 warnings · 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Notes

- Sub-agent 2 initially flagged a CRITICAL "missing `name` on FormField input" — confirmed false positive: `src/components/auth/FormField.tsx:44` uses `name={name ?? id}`, and Phase 2 manual step 2.8 verified end-to-end submission. Not included as a finding.

## Findings

### F1 — Server schema accepts whitespace-only names

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/schemas.ts:5
- **Detail**: `z.string().min(1)` accepts `"   "` (3 spaces). The React form trims for client-side validation (`AddRecipeForm.tsx:21`), but the server schema is the actual trust boundary — a curl POST with whitespace-only `name` passes validation and persists a blank row. DB constraint `char_length(name) between 1 and 200` from F-01 only enforces length, not trimming.
- **Fix**: Add `.trim()` before `.min(1)`: `z.string().trim().min(1, "Nazwa jest wymagana").max(200, ...)`. Rejects whitespace-only AND stores the trimmed value.
- **Decision**: FIXED

### F2 — Supabase insert error silently swallowed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/recipes/index.ts:38-42
- **Detail**: The Supabase `error` object is discarded — only a generic Polish message is shown to the user. RLS violations, constraint failures, and schema drift all look identical in logs (i.e., invisible). Sister route `src/pages/api/auth/signup.ts:16` at least surfaces `error.message` in the redirect; this route loses everything.
- **Fix**: Add `console.error("recipes.insert failed", error);` before the redirect. Keep the user-facing message generic.
- **Decision**: FIXED

### F3 — Unplanned validation-error fallback string

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence (Scope)
- **Location**: src/pages/api/recipes/index.ts:26
- **Detail**: Plan called for `result.error.errors[0].message`. Implementation uses `result.error.issues[0]?.message ?? "Błąd walidacji"`. The `issues` rename is a forced v4 adaptation (MATCH), but the optional chain + fallback is unreachable in practice — `issues` is non-empty whenever `success === false`. Defensive but dead code.
- **Fix**: Drop the fallback: `result.error.issues[0].message`. Or keep it as belt-and-suspenders — both are defensible.
- **Decision**: FIXED — verified `result.error.issues[0].message` type-checks clean (no `noUncheckedIndexedAccess` in tsconfig). Also relaxed `no-console` in `eslint.config.js` to allow `console.error`/`console.warn` (needed by F2's logging on Cloudflare Workers).

### F4 — Form input lost on validation redirect

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (UX)
- **Location**: src/pages/api/recipes/index.ts:24-29
- **Detail**: On validation failure, redirect to `/recipes/new?error=...` drops everything the user typed. Mild for a 2-field form; will get painful in S-05 (edit) or any larger form. Not in scope for S-02.
- **Fix**: Defer. Worth a lessons.md entry when the third form lands.
- **Decision**: SKIPPED

### F5 — Auth-failure redirects from a POST API route

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/recipes/index.ts:9-11
- **Detail**: On missing `context.locals.user`, returns a 302 to `/auth/signin`. Works for the form submitter (Phase 2 confirmed), but would not make sense to a JSON/fetch caller. The plan and CLAUDE.md treat this route as form-only for now. Worth a content-negotiation branch (401 JSON if `Accept: application/json`) before any non-form caller appears.
- **Fix**: Defer until a JSON caller exists.
- **Decision**: SKIPPED — explored Option A (Accept-header content negotiation) inline, but reverted; not worth the surface-area cost for an endpoint with one form-only caller. Revisit if a JSON client appears.

### F6 — formData() throws on JSON bodies

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Reliability
- **Location**: src/pages/api/recipes/index.ts:18
- **Detail**: A POST with `Content-Type: application/json` will 500 instead of 400. Same low-priority bucket as F5 — only matters when a non-form caller appears.
- **Fix**: Defer. Pair with F5 when adding content-negotiation.
- **Decision**: SKIPPED

### F7 — Client-side length check doesn't mirror server trim

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/recipes/AddRecipeForm.tsx:23
- **Detail**: Client uses `name.length > 200`; if F1 is applied, server uses trimmed length. Drift is harmless (only edge: a name of 199 chars + 2 trailing spaces passes client, gets trimmed server-side to 199 — perfectly fine). Only worth a follow-up edit if F1 lands.
- **Fix**: Tie to F1 outcome.
- **Decision**: FIXED — `name.trim().length > 200` mirrors the server's trimmed `.max(200)`.

### F8 — /recipes/new protection depends on startsWith semantics

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts (consumer: src/pages/recipes/new.astro)
- **Detail**: `PROTECTED_ROUTES = ["/recipes"]` + `startsWith` covers `/recipes/new` correctly today. If middleware ever moves to exact-match, the new page silently unprotects. Plan explicitly anticipated this (Current State Analysis bullet 3) and chose not to change it.
- **Fix**: No action; record as a lessons.md candidate if `PROTECTED_ROUTES` semantics ever change.
- **Decision**: FIXED — added `/recipes/new` explicitly to `PROTECTED_ROUTES`. Redundant under current `startsWith` semantics, but survives a future move to exact-match.
