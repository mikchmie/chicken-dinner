# Add Recipe to Collection (S-02) — Plan Brief

> Full plan: `context/changes/add-recipe-to-collection/plan.md`

## What & Why

S-02 activates the write path for the recipe collection: a signed-in user can open `/recipes/new`, enter a name and pick one of six fixed categories, and see the new recipe in their list. This is also the first slice that validates user input, so it introduces `zod` and establishes the server validation pattern that S-03 (schedule generation) and S-05 (edit/delete) will follow.

## Starting Point

`src/pages/recipes.astro` already renders the recipe list and an empty state with a **disabled** "Dodaj przepis" button marked "wkrótce". The `recipes` table, RLS policies, and `src/types.ts` types are all in place from F-01. No write path, no `zod`, no `src/lib/schemas.ts`, and no `src/components/recipes/` directory exist yet.

## Desired End State

A heading row on `/recipes` shows an active "Dodaj przepis" link. Clicking it opens `/recipes/new` with a name field and a styled category dropdown. On valid submission the recipe is inserted and the user lands back on `/recipes` with the new entry visible in the sorted list. The empty-state disabled button and "wkrótce" hint are gone.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Form route shape | Separate page `/recipes/new` | Matches the SSR-first auth pattern; auto-protected by existing `startsWith("/recipes")` middleware. | Plan |
| Category input | Native `<select>` styled to match inputs | Least implementation work for a 6-option closed list; no new component needed. | Plan |
| Post-submit behaviour | Redirect to `/recipes` | Mirrors the auth success-redirect pattern; user immediately sees the result. | Plan |
| Zod schema location | `src/lib/schemas.ts` (shared) | Gives S-03 and S-05 a clear home for future schemas, per roadmap's "clean contract" note. | Plan |
| Add button placement | Heading row (both states) | Single consistent location above the list regardless of whether the collection is empty. | Plan |
| Back link on new page | Yes — "← Przepisy" text link | Lets users cancel without submitting; one line of markup. | Plan |
| Name validation | Required + max 200 chars | Mirrors the DB `CHECK` constraint exactly — no surprising server-side rejections. | Plan |
| Duplicate names | Allowed | No `UNIQUE` constraint in schema; PRD doesn't require uniqueness at MVP collection sizes. | Plan |

## Scope

**In scope:**
- Install `zod`; create `src/lib/schemas.ts` with `RecipeCreateSchema`
- `POST /api/recipes` endpoint with auth guard, validation, insert, redirect
- `src/components/recipes/AddRecipeForm.tsx` React island
- `src/pages/recipes/new.astro` page
- Update `src/pages/recipes.astro`: activate heading-row link, remove disabled CTA

**Out of scope:**
- Edit or delete recipes (S-05)
- Schedule generation (S-03)
- Duplicate name checks
- Success toast / "add another" UX
- Automated tests (Module 3)

## Architecture / Approach

Standard Astro SSR + React island pattern: Astro page at `/recipes/new` reads `?error=` and passes it as a prop to the `AddRecipeForm` React island (`client:load`). The form submits natively via `<form method="POST" action="/api/recipes">`. The API route validates with `zod`, inserts with an explicit `user_id`, and returns a redirect — no JSON, no client-side fetch. Identical shape to the existing auth API routes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Zod + API route | Write path end-to-end; testable without UI | `user_id` not set explicitly → RLS rejects insert silently |
| 2. Form + /recipes/new | User-facing add flow with client-side validation | Select styling may look off-colour on some browsers (native `<select>` appearance quirks) |
| 3. Activate /recipes | Enabled "Dodaj przepis" link; disabled CTA removed | Regression: disabled button/wkrótce copy must fully disappear |

**Prerequisites:** F-01 landed (recipes table + RLS + types); S-01 landed (`/recipes` page, middleware, Topbar).  
**Estimated effort:** ~1 focused session across 3 phases.

## Open Risks & Assumptions

- Native `<select>` with `appearance-none` on WebKit may need a custom caret icon — acceptable for MVP, worth noting.
- The open-state dropdown popup on Safari/Chrome (macOS) renders with native OS chrome that ignores `<option>` background styling, so the opened list will look light against the cosmic backdrop. Accepted for MVP; revisit by swapping to shadcn `Select` if it becomes visually jarring.
- `SubmitButton` uses `useFormStatus()`, which requires React 19's form actions or a parent `<form>` — the latter is satisfied here, but the `pending` state won't fire until the form actually POSTs (client-side validation short-circuits before that).

## Success Criteria (Summary)

- A signed-in user can add a recipe via `/recipes/new` and see it appear in `/recipes`.
- Client-side validation blocks empty name, over-200-char name, and unselected category before any server round-trip.
- The disabled "Dodaj przepis" button and "wkrótce" copy on `/recipes` are gone.
