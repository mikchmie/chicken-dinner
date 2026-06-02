# Add Recipe to Collection (S-02) — Implementation Plan

## Overview

Wire up the "add a recipe" flow so a signed-in user can open a form at `/recipes/new`, supply a name and one of six fixed categories, and see the new recipe in their collection at `/recipes`. This is the first slice that accepts user input and writes to the database, so it also introduces `zod` and establishes the validation contract that S-03 and S-05 will follow.

## Current State Analysis

- `src/types.ts` exports `CATEGORIES`, `CATEGORY_LABELS_PL`, and `Recipe` — all consumed directly by this slice.
- `src/pages/recipes.astro` renders the list with a **disabled** "Dodaj przepis" `<Button>` and a "wkrótce" hint inside the empty-state card; Phase 3 replaces this with an active link.
- `src/middleware.ts` gates all paths whose `pathname.startsWith("/recipes")` — so `/recipes/new` and `/api/recipes` are **not** auto-protected (the API prefix is `/api/...`). The `/recipes/new` page route _is_ protected. The API route guards itself via `context.locals.user`.
- Auth API routes follow the pattern: `formData()` → business logic → `context.redirect(...)` on success or failure. S-02 follows this shape exactly.
- `src/components/auth/FormField.tsx` renders `<input>` only. The category select is written inline in `AddRecipeForm.tsx` with matching Tailwind classes.
- `zod` is not yet in `package.json`. CLAUDE.md explicitly defers it to "the first endpoint that needs validation" — that is this slice.

### Key Discoveries

- `PROTECTED_ROUTES = ["/recipes"]` with `startsWith` covers `/recipes/new` (page) automatically. The `/api/recipes` route is separate and must check `context.locals.user` itself.
- Middleware resolves `context.locals.user` for all requests (including API routes) before calling `next()`, so the API route can read `context.locals.user` without calling `supabase.auth.getUser()` again.
- Astro 6 supports `src/pages/recipes.astro` (serving `/recipes`) alongside `src/pages/recipes/new.astro` (serving `/recipes/new`) without conflict.
- `SubmitButton` uses `useFormStatus()` from `react-dom` — it must be a child of a React `<form>` element to detect pending state, which the form component satisfies.
- `src/components/ui/button.tsx` is already imported in `recipes.astro` — the "Dodaj przepis" heading-row link can use `Button` with `asChild` or a plain `<a>` styled with `buttonVariants`.

## Desired End State

A signed-in user at `/recipes` sees a heading row with an active "Dodaj przepis" link. Clicking it navigates to `/recipes/new`, which shows a form with a name field and a category selector. On valid submission the recipe appears in the collection at `/recipes`. The empty-state card no longer contains the disabled button or "wkrótce" copy.

### Key Discoveries

- F-01 migration enforces `char_length(name) between 1 and 200` and `category` is a Postgres enum — client and server validation must mirror these constraints.
- `supabase.from("recipes").insert(...)` with the user's `user_id` explicitly set satisfies the `recipes_owner_all` RLS policy (`auth.uid() = user_id`).
- No uniqueness constraint on `(user_id, name)` in the DB — duplicate names are permitted by design.

## What We're NOT Doing

- **No edit or delete.** S-05 owns those.
- **No success toast or "add another" flow.** Post-submit redirects to `/recipes`; if a user wants to add more they click "Dodaj przepis" again.
- **No duplicate-name check.** PRD and schema impose no uniqueness on recipe names.
- **No `SelectField` extraction.** The `<select>` for category is written inline in `AddRecipeForm.tsx`; extraction to a shared component is premature until a second select field exists.
- **No route change to middleware.** `PROTECTED_ROUTES` stays as `["/recipes"]`; the API route self-guards.
- **No new shadcn primitives.** No `npx shadcn@latest add ...` needed.
- **No automated tests.** Module 3 introduces testing strategy; this slice is verified by lint + build + manual walkthrough.

## Implementation Approach

Three phases, smallest-first. Phase 1 lays the data path (schema + API route) so it can be tested with a raw `curl` or Supabase Studio insert before any UI exists. Phase 2 adds the form UI. Phase 3 wires the existing `/recipes` page to the new route. Each phase has its own automated and manual verification gate before proceeding.

## Critical Implementation Details

- **`user_id` must be set explicitly in the INSERT.** RLS enforces access control but does not inject `user_id` on INSERT — the route must pass `user_id: context.locals.user.id`.
- **`/api/recipes` is not covered by `PROTECTED_ROUTES`.** The middleware sets `context.locals.user` for all routes, but only redirects paths that start with `/recipes`. The API route must check `if (!context.locals.user)` and redirect to `/auth/signin` before any Supabase work.
- **`export const prerender = false;`** is required on every API route file per CLAUDE.md ("API routes must export `export const prerender = false;`").

---

## Phase 1: Zod, shared schemas, and the POST /api/recipes route

### Overview

Install `zod`, create `src/lib/schemas.ts` with `RecipeCreateSchema`, and implement the `POST /api/recipes` endpoint. After this phase the write path is complete and can be exercised directly.

### Changes Required

#### 1. Install zod

**File**: `package.json` (via shell)

**Intent**: Pull in `zod` as a runtime dependency — the first endpoint validation library for this project, per CLAUDE.md.

**Contract**: Run `npm install zod`. Verify it appears in `dependencies` (not `devDependencies`) in `package.json`.

#### 2. Shared domain validation schemas

**File**: `src/lib/schemas.ts` (new)

**Intent**: Centralise all domain `zod` schemas in one file so S-03 and S-05 have a clear home for `ScheduleCreateSchema` and `RecipeUpdateSchema`. The `RecipeCreateSchema` defined here is the single source of truth for what constitutes a valid recipe creation payload — both the API route and the client-side form validate against its constraints.

**Contract**: Export `RecipeCreateSchema` as a `z.object` with two fields:

```ts
import { z } from "zod";
import { CATEGORIES } from "@/types";

export const RecipeCreateSchema = z.object({
  name: z
    .string()
    .min(1, "Nazwa jest wymagana")
    .max(200, "Nazwa może mieć maksymalnie 200 znaków"),
  category: z.enum(CATEGORIES, {
    errorMap: () => ({ message: "Wybierz kategorię" }),
  }),
});
```

`z.enum(CATEGORIES)` consumes the existing `CATEGORIES` const-array — no duplication of the six values. The error messages are Polish to match the UI convention.

#### 3. POST /api/recipes endpoint

**File**: `src/pages/api/recipes/index.ts` (new)

**Intent**: Accept a `multipart/form-data` POST, auth-guard via `context.locals.user`, validate with `RecipeCreateSchema`, insert the recipe into Supabase with the authenticated user's `user_id`, and redirect to `/recipes` on success or back to `/recipes/new?error=...` on any failure. This is the entire write path for S-02.

**Contract**:

```ts
export const prerender = false;
export const POST: APIRoute = async (context) => { ... }
```

Logic sequence:
1. `const user = context.locals.user` — if `null`, `return context.redirect("/auth/signin")`
2. `const supabase = createClient(context.request.headers, context.cookies)` — if `null`, redirect `/recipes/new?error=Supabase nie jest skonfigurowany`
3. `const form = await context.request.formData()`; build `{ name: form.get("name"), category: form.get("category") }`
4. `RecipeCreateSchema.safeParse(raw)` — if `!result.success`, redirect `/recipes/new?error=<encodeURIComponent(result.error.errors[0].message)>`
5. `await supabase.from("recipes").insert({ name: result.data.name, category: result.data.category, user_id: user.id })` — if `error`, redirect `/recipes/new?error=Nie udało się dodać przepisu`
6. `return context.redirect("/recipes")`

### Success Criteria

#### Automated Verification

- Lint + types pass: `npx astro sync && npm run lint`
- Production build succeeds: `npm run build`
- Prettier check on new/changed files: `npx prettier --check src/lib/schemas.ts src/pages/api/recipes/index.ts`

#### Manual Verification

- With local Supabase running and a signed-in session, POST to `/api/recipes` (via curl or form submit) with `name=Test&category=chicken` — confirm redirect to `/recipes` and the row appears in the `recipes` table in Studio.
- POST with an empty name — confirm redirect to `/recipes/new?error=Nazwa jest wymagana`.
- POST with a 201-character name — confirm redirect with the max-length error message.
- POST with an invalid category value (e.g. `category=invalid`) — confirm redirect with "Wybierz kategorię".
- POST without a session cookie — confirm redirect to `/auth/signin`.

**Implementation Note**: After this phase's automated verification passes, confirm the manual steps before proceeding to Phase 2.

---

## Phase 2: AddRecipeForm React component and /recipes/new page

### Overview

Create the `AddRecipeForm` React island (client-side validated form, mirrors auth form pattern) and the `/recipes/new` Astro page that hosts it.

### Changes Required

#### 4. AddRecipeForm React component

**File**: `src/components/recipes/AddRecipeForm.tsx` (new — creates `src/components/recipes/` directory)

**Intent**: A React form island for adding a recipe. Follows the `SignUpForm` pattern: controlled inputs, a `validate()` function, `handleSubmit` that calls `e.preventDefault()` if validation fails, and native `<form method="POST" action="/api/recipes">` for the happy path. The component receives a `serverError` prop from the Astro page (populated from `?error=` query param) and displays it via `ServerError`.

**Contract**:

Props: `serverError?: string | null`

State: `name: string` (initially `""`), `category: string` (initially `""`), `errors: { name?: string; category?: string }` (initially `{}`)

`validate()`: checks `name.trim()` non-empty and `name.length <= 200`, checks `category` is non-empty. Sets `errors` and returns `true` only if both pass. Error messages match `RecipeCreateSchema`'s messages exactly: `"Nazwa jest wymagana"`, `"Nazwa może mieć maksymalnie 200 znaków"`, `"Wybierz kategorię"`.

`handleSubmit(e)`: calls `validate()`; calls `e.preventDefault()` if invalid.

Rendered structure (inside `<form method="POST" action="/api/recipes" className="space-y-4" onSubmit={handleSubmit} noValidate>`):
- `<FormField>` for the name (`id="name"`, label `"Nazwa przepisu"`, placeholder `"np. Kotlet schabowy"`, icon `<UtensilsCrossed className="size-4" />` from `lucide-react`, `error={errors.name}`)
- A label+select block for category (described below)
- `<ServerError message={serverError} />`
- `<SubmitButton pendingText="Dodawanie..." icon={<Plus className="size-4" />}>Dodaj przepis</SubmitButton>`

Category select block:
```tsx
<div>
  <label htmlFor="category" className="mb-1 block text-sm text-blue-100/80">
    Kategoria
  </label>
  <select
    id="category"
    name="category"
    value={category}
    onChange={(e) => { setCategory(e.target.value); clearError("category"); }}
    className={cn(
      "w-full rounded-lg bg-white/10 border px-3 py-2 text-white focus:outline-none focus:ring-2 transition-colors appearance-none",
      errors.category ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400"
    )}
  >
    <option value="" disabled>-- wybierz --</option>
    {CATEGORIES.map((cat) => (
      <option key={cat} value={cat} className="bg-gray-900 text-white">
        {CATEGORY_LABELS_PL[cat]}
      </option>
    ))}
  </select>
  {errors.category && (
    <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
      <CircleAlert className="size-3" />
      {errors.category}
    </p>
  )}
</div>
```

`CircleAlert` imported from `lucide-react` (already used in `FormField.tsx`). The snippet is included because the select block diverges from `FormField` — the implementer needs the exact class set for visual consistency.

#### 5. /recipes/new Astro page

**File**: `src/pages/recipes/new.astro` (new)

**Intent**: The add-recipe page. Reads the optional `?error=` query param, renders the cosmic layout with Topbar, a back link, a heading, and the `AddRecipeForm` island.

**Contract**:
- `const serverError = Astro.url.searchParams.get("error");`
- `<Layout title="Nowy przepis">`; same cosmic background and Topbar pattern as `recipes.astro`
- Above the `<h1>`: a back link `<a href="/recipes" class="...text-blue-100/60 hover:text-white...">← Przepisy</a>`
- `<h1>Dodaj przepis</h1>` (Polish, sentence-case heading)
- `<AddRecipeForm client:load serverError={serverError} />` inside the centred `<main class="mx-auto max-w-2xl px-4 py-12">`
- The form is wrapped in the same `rounded-xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl` card used for the empty state in `recipes.astro`

### Success Criteria

#### Automated Verification

- Lint + types pass: `npx astro sync && npm run lint`
- Production build succeeds: `npm run build`
- Prettier check: `npx prettier --check src/components/recipes/AddRecipeForm.tsx src/pages/recipes/new.astro`

#### Manual Verification

- Navigate to `/recipes/new` while signed in — the page renders with cosmic styling, a "← Przepisy" back link, and the form.
- Submit with empty name — inline "Nazwa jest wymagana" error appears; no POST sent.
- Submit with name = 201-character string — inline max-length error appears.
- Select no category and submit — inline "Wybierz kategorię" error appears.
- Fill in valid name + category, submit — redirected to `/recipes` and the new recipe appears in the list.
- Visit `/recipes/new?error=Nie+udało+się+dodać+przepisu` directly — confirm the server error appears below the category field.
- Click "← Przepisy" — navigated back to `/recipes`.

**Implementation Note**: After this phase's automated verification passes, confirm the manual steps before proceeding to Phase 3.

---

## Phase 3: Activate the add-recipe affordance on /recipes

### Overview

Update `src/pages/recipes.astro` to replace the disabled "wkrótce" CTA with an active heading-row layout: a `flex justify-between` row with the page heading on the left and an active "Dodaj przepis" link on the right, visible in both empty and non-empty states.

### Changes Required

#### 6. Update recipes.astro

**File**: `src/pages/recipes.astro`

**Intent**: The disabled button and "wkrótce" copy are replaced by a real navigation link to `/recipes/new`. The add action lives in the heading row so it is visible regardless of whether the collection is empty.

**Contract**:

Replace the current heading:
```tsx
<h1 class="mb-8 text-2xl font-bold text-white">Twoje przepisy</h1>
```
with a flex row:
```tsx
<div class="mb-8 flex items-center justify-between">
  <h1 class="text-2xl font-bold text-white">Twoje przepisy</h1>
  <a
    href="/recipes/new"
    class="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
  >
    Dodaj przepis
  </a>
</div>
```

In the empty-state `recipes.length === 0` branch: remove the `<Button disabled ...>` element and the `<p class="mt-3 ...">wkrótce</p>` hint entirely. Keep the descriptive `<p>` body copy ("Nie masz jeszcze żadnych przepisów..."). The heading-row link is the sole add-recipe affordance.

Also remove the now-unused `import { Button } from "@/components/ui/button";` line at the top of the file — after this phase, `recipes.astro` no longer uses the `Button` component, and ESLint's `@typescript-eslint/no-unused-vars: "error"` rule (`eslint.config.mjs:25`) would otherwise fail `npm run lint` (Success Criterion 3.1).

No other changes to `recipes.astro`. The list branch (`recipes.length > 0`) is unchanged beyond the heading row update.

### Success Criteria

#### Automated Verification

- Lint + types pass: `npx astro sync && npm run lint`
- Production build succeeds: `npm run build`
- Prettier check: `npx prettier --check src/pages/recipes.astro`

#### Manual Verification

- `/recipes` with zero recipes: shows the empty-state card with body copy but **no** disabled button and **no** "wkrótce" text. The heading row shows an active "Dodaj przepis" link.
- `/recipes` with one or more recipes: shows the list **and** the "Dodaj przepis" link in the heading row.
- Clicking "Dodaj przepis" navigates to `/recipes/new`.
- Full round-trip: sign in → `/recipes` (empty) → click "Dodaj przepis" → fill form → submit → land on `/recipes` with new recipe in list.

**Implementation Note**: After this phase's automated verification passes, confirm the manual steps. The full round-trip test in manual verification is the slice acceptance test — completing it means S-02 is done.

---

## Testing Strategy

### Unit Tests

None added. Module 3 introduces testing strategy; this slice is verified by type-check + build + manual walkthrough.

### Integration Tests

None added.

### Manual Testing Steps

1. Sign in as a test user and navigate to `/recipes` — confirm the "Dodaj przepis" link is active in the heading row.
2. Click "Dodaj przepis" — confirm `/recipes/new` loads with cosmic styling, back link, and form.
3. Submit the form with an empty name — confirm inline error; no POST fired.
4. Submit with a 201-char name — confirm inline max-length error.
5. Submit with a valid name but no category selected — confirm inline category error.
6. Fill in a valid name and category, submit — confirm redirect to `/recipes` and the recipe appears in the list with its Polish category label.
7. Add a second recipe — confirm both appear, sorted by name.
8. Sign out, navigate to `/recipes/new` directly — confirm redirect to `/auth/signin`.

## Performance Considerations

None. The INSERT is a single indexed row under RLS. The form page is server-rendered with a single React island hydrated on `client:load`.

## Migration Notes

No database migration. The `recipes` table and `user_id` column exist from F-01.

## References

- Roadmap: `context/foundation/roadmap.md` (S-02 row + Slice block)
- PRD: `context/foundation/prd.md` (FR-005)
- F-01 plan: `context/archive/2026-05-31-recipes-and-schedules-schema/plan.md` (schema shape, `user_id` FK, RLS policies)
- S-01 plan (archived): `context/archive/2026-06-02-signed-in-empty-home/plan.md` (routing conventions, form component shape)
- Lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Zod, shared schemas, and the POST /api/recipes route

#### Automated

- [x] 1.1 Lint + types pass: `npx astro sync && npm run lint`
- [x] 1.2 Production build succeeds: `npm run build`
- [x] 1.3 Prettier check: `npx prettier --check src/lib/schemas.ts src/pages/api/recipes/index.ts`

#### Manual

- [x] 1.4 POST with valid name + category redirects to `/recipes` and inserts a row in Studio
- [x] 1.5 POST with empty name redirects to `/recipes/new?error=Nazwa jest wymagana`
- [x] 1.6 POST with 201-char name redirects with max-length error
- [x] 1.7 POST with invalid category redirects with "Wybierz kategorię"
- [x] 1.8 POST without session cookie redirects to `/auth/signin`

### Phase 2: AddRecipeForm component and /recipes/new page

#### Automated

- [ ] 2.1 Lint + types pass: `npx astro sync && npm run lint`
- [ ] 2.2 Production build succeeds: `npm run build`
- [ ] 2.3 Prettier check: `npx prettier --check src/components/recipes/AddRecipeForm.tsx src/pages/recipes/new.astro`

#### Manual

- [ ] 2.4 `/recipes/new` renders with cosmic styling, back link, and form
- [ ] 2.5 Submit with empty name shows inline "Nazwa jest wymagana" error
- [ ] 2.6 Submit with 201-char name shows inline max-length error
- [ ] 2.7 Submit with no category selected shows inline "Wybierz kategorię"
- [ ] 2.8 Valid submission redirects to `/recipes` and recipe appears in list
- [ ] 2.9 `/recipes/new?error=...` shows the server error below the category field
- [ ] 2.10 Back link "← Przepisy" navigates to `/recipes`

### Phase 3: Activate the add-recipe affordance on /recipes

#### Automated

- [ ] 3.1 Lint + types pass: `npx astro sync && npm run lint`
- [ ] 3.2 Production build succeeds: `npm run build`
- [ ] 3.3 Prettier check: `npx prettier --check src/pages/recipes.astro`

#### Manual

- [ ] 3.4 `/recipes` (empty) shows heading-row "Dodaj przepis" link; no disabled button, no "wkrótce" text
- [ ] 3.5 `/recipes` (with recipes) shows the list AND the active "Dodaj przepis" link
- [ ] 3.6 Clicking "Dodaj przepis" navigates to `/recipes/new`
- [ ] 3.7 Full round-trip: sign in → empty recipes → add recipe → land on list with new recipe visible
