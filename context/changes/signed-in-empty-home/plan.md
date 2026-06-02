# Sign-in lands on a ChickenDinner empty recipe list — Implementation Plan

## Overview

Stand up `/recipes` as the protected post-signin home with a server-rendered empty-recipes view, retire `/dashboard`, and replace the generic 10x-astro-starter shell on every user-visible surface with Polish-language ChickenDinner copy. After this slice, a user can sign up, confirm, sign in, and land on a ChickenDinner-branded page that lists their (empty) recipe collection — closing FR-001 through FR-004 and the roadmap risk that "Polish-language copy lands here."

## Current State Analysis

- **Auth scaffolding is complete and starter-flavoured.** `src/pages/auth/{signin,signup,confirm-email}.astro` and `src/pages/api/auth/{signin,signup,signout}.ts` work end-to-end. Sign-in redirects to `/`, sign-up to `/auth/confirm-email`, sign-out to `/`. All page chrome, headings, button labels, validation messages, and `aria-label`s are in English.
- **`/dashboard` is the only protected route**, gated by `PROTECTED_ROUTES = ["/dashboard"]` in `src/middleware.ts:4`. The page (`src/pages/dashboard.astro`) shows generic placeholder copy ("This page is only for authenticated users") and a sign-out form.
- **`/` shows `Welcome.astro`** — a cosmic marketing splash titled "10x Astro Starter" with three feature cards about the starter ("Authentication Ready", "Modern Stack", "Developer Experience"). None of it talks about ChickenDinner.
- **Schema is ready** from archived F-01 (`context/archive/2026-05-31-recipes-and-schedules-schema/`). `recipes` table is RLS-scoped to `auth.uid()`; `src/types.ts` exports `Category`, `CATEGORIES`, `Recipe`. No category-label localisation exists yet.
- **Data-fetch pattern is server-side.** `dashboard.astro` reads `Astro.locals.user` in frontmatter; no API route abstraction, no client-side fetch. `createClient(headers, cookies)` returns `null` when env vars are missing — `Layout.astro` already surfaces the Polish "Supabase nie jest skonfigurowany" banner via `src/lib/config-status.ts`, so the page can treat `null` as an empty fetch result without duplicating the warning.
- **`<html lang="en">`** is hardcoded in `src/layouts/Layout.astro:14` — needs `lang="pl"` for an all-Polish UI.
- **Leaf form components are prop-driven.** `FormField`, `SubmitButton`, `ServerError` carry no English literals — they render labels/placeholders/messages from props. Only `PasswordToggle` has hardcoded `aria-label="Hide password" / "Show password"`. All other English copy lives in `SignInForm`/`SignUpForm` (validation messages, button labels, placeholders) and the `.astro` page chrome.

## Desired End State

- A signed-in user visiting `/recipes` sees a ChickenDinner-branded page in Polish with their (empty) recipe collection: a centred card explaining the collection is empty and a disabled "Dodaj przepis" CTA marked "wkrótce". When recipes exist, the same page renders them as a simple list of name + Polish category label, ordered by name.
- The `/api/auth/signin` success handler redirects to `/recipes`.
- `/dashboard` no longer exists; navigating to it 404s. Middleware protects `/recipes` instead.
- Visiting `/` while signed out shows a short Polish ChickenDinner landing pitch with sign-in / sign-up CTAs. The cosmic styling carries over; the feature cards and "10x Astro Starter" copy do not.
- Every user-visible string on `/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, the Topbar, and the form components is in Polish. Page `<title>`s are Polish; `<html>` is `lang="pl"`.

### Key Discoveries

- F-01 plan-brief (`context/archive/2026-05-31-recipes-and-schedules-schema/plan-brief.md`) confirms the canonical data pattern: hand-written domain types in `src/types.ts`, RLS at the database does the user-scoping, no Supabase typegen.
- `src/middleware.ts:18` uses `startsWith` for protected-route matching, so `/recipes` will cover `/recipes/...` (matters for S-02's add-form route later).
- `Layout.astro:21-32` already iterates `missingConfigs` and renders the Polish Supabase-missing banner — protected pages don't need to re-handle the null-Supabase case beyond a defensive empty array.
- `wrangler.jsonc` already has `disable_nodejs_process_v2` per `context/foundation/lessons.md` — no infra change needed for this slice.

## What We're NOT Doing

- **No add-recipe form, route, or API.** The "Dodaj przepis" button is disabled with a "wkrótce" affordance. S-02 (`add-recipe-to-collection`) owns the write path.
- **No edit, delete, or detail view of recipes.** S-05 owns those.
- **No schedules surface.** S-03 owns it.
- **No zod, no service layer extraction, no repository abstraction.** Direct `supabase.from("recipes").select(...)` in the page frontmatter — matches the existing pattern and CLAUDE.md guidance to introduce zod in the first slice that needs input validation.
- **No `?next=` deep-link redirect handling on signin.** Premature flexibility; PRD doesn't ask for it.
- **No translation of Supabase-emitted error messages** (e.g. "Invalid login credentials"). They flow through `ServerError` as-is from `?error=` query params; localising them would require either an error-code map or a server-side rewrite — out of scope.
- **No rename of the starter's package, worker, or repo name** (`10x-astro-starter` stays in `package.json`, `wrangler.jsonc`, `README.md` per the CLAUDE.md tripwire).
- **No new shadcn primitives.** The empty-state card is plain Tailwind; the disabled button reuses the existing `Button` from `src/components/ui/button.tsx`.
- **No automated tests added in this slice.** Testing strategy is Module 3 territory; manual verification covers this surface.

## Implementation Approach

Two phases, smallest-first: Phase 1 ships the load-bearing capability (the protected `/recipes` page + the routing wire-up that makes signin lead there); Phase 2 polishes copy across all remaining surfaces. Phase 1 alone leaves the auth pages and the public landing in English, which is uncomfortable but verifiable — manual sign-in still ends on a working Polish recipes page. Phase 2 closes the language tripwire. Implementer can ship Phase 1 to live as a coherent partial state if needed.

## Phase 1: Recipes home and routing wire-up

### Overview

Create `/recipes` as the new protected home: server-rendered query against the `recipes` table, list-or-empty-card render, Polish copy *on this page only*. Update `PROTECTED_ROUTES`, the signin redirect, and the Topbar's protected link so the post-signin flow lands users at `/recipes`. Delete `dashboard.astro` once nothing references it.

### Changes Required

#### 1. Polish category labels constant

**File**: `src/types.ts`

**Intent**: Add a canonical, type-safe mapping from `Category` to its Polish display label so the recipe list (and every future surface that shows a category) reads from one source. Centralising here keeps the category-related constants together with `CATEGORIES`.

**Contract**: Export `CATEGORY_LABELS_PL: Record<Category, string>`. Keys are the six enum values (`"chicken"`, `"pork"`, `"beef"`, `"leguminous"`, `"eggs"`, `"vegetables"`); values are `"Kurczak"`, `"Wieprzowina"`, `"Wołowina"`, `"Rośliny strączkowe"`, `"Jajka"`, `"Warzywa"` (sentence case).

#### 2. Protected recipes page

**File**: `src/pages/recipes.astro` (new)

**Intent**: The post-signin home. Server-render the user's recipe collection from Supabase under RLS, render an empty-state card with a disabled CTA when there are zero recipes, or a simple sorted list of name + category label when there are some. Use `Layout` with a Polish `<title>` ("Przepisy"). Polish copy is fully in this file (no shared i18n layer needed for one slice).

**Contract**:
- Frontmatter: `const supabase = createClient(Astro.request.headers, Astro.cookies)`. If `supabase` is `null`, treat `recipes` as `[]` (the Layout-level missing-config banner already alerts the user; no additional error UI here). Otherwise `await supabase.from("recipes").select("id, name, category").order("name", { ascending: true })`. On a returned `error`, render the empty-state card (the page should not throw); the error is incidental for an MVP single-user flow and the empty card is a safe fallback. Capture the resulting array as `recipes: Pick<Recipe, "id" | "name" | "category">[]`.
- Layout: wrap in `<Layout title="Przepisy">`. Reuse the existing cosmic background (the `bg-cosmic` + orb + star-field pattern from `dashboard.astro`/`Welcome.astro`) so visual identity is consistent. Place a `Topbar` at the top of the page content.
- Render branches:
  - `recipes.length === 0`: centred card with heading "Twoje przepisy", body copy "Nie masz jeszcze żadnych przepisów. Dodaj pierwszy, aby zacząć układać harmonogramy obiadów.", and a `Button` from `@/components/ui/button` labelled "Dodaj przepis" with `disabled` set and a `title="wkrótce"` attribute plus visible "wkrótce" hint text adjacent to or under the button so the disabled state reads as forthcoming rather than broken.
  - `recipes.length > 0`: heading "Twoje przepisy" and a `<ul>` of one row per recipe — `recipe.name` (primary text) and `CATEGORY_LABELS_PL[recipe.category]` (secondary text, smaller/muted). No edit/delete affordances; ordering by name.

#### 3. Update protected-routes list

**File**: `src/middleware.ts`

**Intent**: Replace the placeholder `/dashboard` gate with `/recipes`. Future S-02 paths under `/recipes/...` will be covered automatically by the existing `startsWith` matcher.

**Contract**: `PROTECTED_ROUTES = ["/recipes"]`.

#### 4. Update signin success redirect

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Send freshly-signed-in users straight to the recipe collection. Matches S-01's outcome statement and FR-004.

**Contract**: The final `return context.redirect("/")` becomes `return context.redirect("/recipes")`. Error redirects to `/auth/signin?error=...` are unchanged.

#### 5. Update Topbar's protected link

**File**: `src/components/Topbar.astro`

**Intent**: When a user is signed in, the topbar link should point at the new home. (Copy localisation of the rest of the Topbar lands in Phase 2 — only the `href` and label of this one link change here so Phase 1 stays internally consistent.)

**Contract**: Change the `<a href="/dashboard">Dashboard</a>` element to `<a href="/recipes">Przepisy</a>`. All other Topbar strings stay in English for now (Phase 2 finishes them).

#### 6. Delete the placeholder dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Remove dead code so `/dashboard` 404s. Nothing else in the tree references it after steps 3 and 5.

**Contract**: File deleted.

### Success Criteria

#### Automated Verification

- Type check passes: `npx astro sync && npm run lint`
- Production build succeeds: `npm run build`
- Prettier check passes for changed files: `npx prettier --check src/pages/recipes.astro src/types.ts src/middleware.ts src/pages/api/auth/signin.ts src/components/Topbar.astro`

#### Manual Verification

- Visiting `/dashboard` while signed in returns 404.
- Visiting `/recipes` while signed out redirects to `/auth/signin`.
- Signing in via `/auth/signin` lands the user on `/recipes` (no intermediate hop to `/`).
- A signed-in user with zero recipes sees the empty-state card with a disabled "Dodaj przepis" CTA and a visible "wkrótce" affordance.
- After inserting a recipe directly via Supabase Studio, refreshing `/recipes` shows the recipe row with its Polish category label, sorted by name.
- The Layout-level "Supabase nie jest skonfigurowany" banner still appears when env vars are removed (regression check).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the manual testing was successful before proceeding to Phase 2. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Polish-language ChickenDinner brand on public surfaces

### Overview

Replace the remaining 10x-astro-starter strings (public `/`, auth pages, Topbar guest/signed-in chrome, form validation messages and labels, `<title>`s, `<html lang>`) with Polish ChickenDinner copy. Closes the CLAUDE.md tripwire and the roadmap risk note. No behavioural changes — pure copy + lang attribute.

### Changes Required

#### 1. Layout defaults

**File**: `src/layouts/Layout.astro`

**Intent**: The default document title should say ChickenDinner, and the document language should be Polish so assistive tech and the browser treat the page accordingly.

**Contract**: Change `const { title = "10x Astro Starter" }` to `const { title = "ChickenDinner" }`. Change `<html lang="en">` to `<html lang="pl">`. No other markup changes.

#### 2. Public landing — replace Welcome content

**File**: `src/components/Welcome.astro`

**Intent**: Turn the cosmic splash into a one-screen Polish ChickenDinner intro: keep the cosmic background, orbs, and star-field; replace the hero copy and the three starter feature cards with ChickenDinner messaging. Keep the sign-in / sign-up CTAs.

**Contract**:
- Hero `<h1>`: "ChickenDinner" (replaces "10x Astro Starter").
- Hero subtitle paragraph: a single sentence in Polish describing the product, e.g. "Generuj urozmaicone tygodniowe harmonogramy obiadów z Twojej własnej kolekcji przepisów." (implementer may refine; ≤ ~120 chars, no marketing fluff).
- The two CTA buttons keep their `href`s (`/auth/signin`, `/auth/signup`) but change labels to "Zaloguj się" and "Zarejestruj się".
- The three feature-card section (`<!-- Feature cards -->`) is removed — those cards advertise the starter, not the product. The page ends after the hero CTAs.
- Retain the `<Topbar />` component at the top of the page content div — it is the canonical nav for both guest and signed-in states on every surface.

#### 3. Topbar — guest and signed-in chrome

**File**: `src/components/Topbar.astro`

**Intent**: Localise the remaining guest/signed-in strings so the bar is fully Polish in both states. (The protected link was already updated in Phase 1.)

**Contract**: Translate `"Not signed in"` → `"Nie zalogowano"`, `"Sign in"` → `"Zaloguj się"`, `"Sign up"` → `"Zarejestruj się"`, `"Sign out"` → `"Wyloguj się"`. The two signed-in links (the protected route and the signout form button) keep their `href`/`action`.

#### 4. Sign-in page chrome

**File**: `src/pages/auth/signin.astro`

**Intent**: Localise the page heading, document `<title>`, and the footer link prompt.

**Contract**: `<Layout title="Sign in">` → `<Layout title="Zaloguj się">`. `<h1>Sign in</h1>` → `<h1>Zaloguj się</h1>`. Footer prompt `"Don't have an account? Sign up"` → `"Nie masz konta? Zarejestruj się"`.

#### 5. Sign-up page chrome

**File**: `src/pages/auth/signup.astro`

**Intent**: Same shape as sign-in.

**Contract**: `<Layout title="Sign up">` → `<Layout title="Zarejestruj się">`. `<h1>Sign up</h1>` → `<h1>Zarejestruj się</h1>`. Footer prompt `"Already have an account? Sign in"` → `"Masz już konto? Zaloguj się"`.

#### 6. Confirm-email page

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Localise both content branches (dev-auto-confirm vs prod-email-confirm) and the document `<title>`. The page's branching logic stays; only the strings inside the `content` object change.

**Contract**: Translate the four fields (`heading`, `description`, `linkText`) in both branches to Polish; suggested copy:
- dev branch: `heading: "Rejestracja udana"`, `description: "Twoje konto zostało utworzone. Możesz się teraz zalogować."`, `linkText: "Przejdź do logowania"`.
- prod branch: `heading: "Sprawdź skrzynkę pocztową"`, `description: "Wysłaliśmy link aktywacyjny na Twój adres e-mail. Kliknij go, aby aktywować konto."`, `linkText: "Powrót do logowania"`.

The emojis (`✅`, `📧`) are language-neutral — keep them.

#### 7. Sign-in form labels, placeholder, validation, button

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: Localise every user-visible string the form renders.

**Contract**: Translate the literals passed to `FormField` (`label="Email"` → `"E-mail"`, `placeholder="you@example.com"` → `"ty@przykład.pl"` or similar; `label="Password"` → `"Hasło"`, `placeholder="Your password"` → `"Twoje hasło"`). Translate `validate()` messages: `"Email is required"` → `"E-mail jest wymagany"`, `"Enter a valid email address"` → `"Podaj prawidłowy adres e-mail"`, `"Password is required"` → `"Hasło jest wymagane"`. Translate `SubmitButton` `pendingText="Signing in..."` → `"Logowanie..."` and its children `"Sign in"` → `"Zaloguj się"`. No behavioural changes.

#### 8. Sign-up form labels, placeholder, validation, button

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Same scope as sign-in, plus the confirm-password field and the password-length hint.

**Contract**: Translate `FormField` props (`"Email"` → `"E-mail"`, `"Password"` → `"Hasło"`, `"Confirm password"` → `"Powtórz hasło"`, placeholders to Polish equivalents — `"Min. 6 characters"` → `"Min. 6 znaków"`, `"Re-enter your password"` → `"Powtórz hasło"`). Translate `validate()` messages including the dynamic password-length message (`"Password must be at least ${MIN_PASSWORD_LENGTH} characters"` → `"Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków"`; `"Please confirm your password"` → `"Powtórz hasło"`; `"Passwords do not match"` → `"Hasła nie pasują do siebie"`). Translate the `passwordHint` JSX (`X more character(s) needed` → `"Brakuje jeszcze X znak(ów)"` — adapt the singular/plural fork to Polish forms (`znak` / `znaki` / `znaków`)). Translate `SubmitButton` (`"Creating account..."` → `"Tworzenie konta..."`, `"Create account"` → `"Utwórz konto"`). No behavioural changes.

#### 9. Password-toggle aria-labels

**File**: `src/components/auth/PasswordToggle.tsx`

**Intent**: The only English in this otherwise icon-only component is the screen-reader label. Keep it Polish for consistency.

**Contract**: `aria-label={visible ? "Hide password" : "Show password"}` → `aria-label={visible ? "Ukryj hasło" : "Pokaż hasło"}`.

### Success Criteria

#### Automated Verification

- Type check passes: `npx astro sync && npm run lint`
- Production build succeeds: `npm run build`
- Prettier check passes for changed files: `npx prettier --check src/layouts/Layout.astro src/components/Welcome.astro src/components/Topbar.astro src/pages/auth/signin.astro src/pages/auth/signup.astro src/pages/auth/confirm-email.astro src/components/auth/SignInForm.tsx src/components/auth/SignUpForm.tsx src/components/auth/PasswordToggle.tsx`
- Grep for residual obvious English on user-visible surfaces returns expected matches only: `grep -nE "Sign in|Sign up|Sign out|Dashboard|Welcome|10x Astro" src/pages src/components src/layouts -r` — only `README.md`, the `LibBadge.astro`, and any starter-marketing comments should remain.

#### Manual Verification

- Visiting `/` while signed out shows a Polish ChickenDinner hero with "Zaloguj się" and "Zarejestruj się" CTAs; no starter feature cards.
- Browser tab title for `/` reads "ChickenDinner".
- `/auth/signin`, `/auth/signup`, `/auth/confirm-email` are fully Polish in headings, form labels, placeholders, button text, and footer prompts.
- Triggering client-side validation on each form (empty submit, bad email, short password, mismatched confirm) shows Polish error messages.
- Submitting valid sign-up credentials lands on `/auth/confirm-email` and reads the dev-auto-confirm Polish content in dev mode.
- Topbar in both signed-in and signed-out states is fully Polish.
- View-source on any page shows `<html lang="pl">`.
- Screen-reader / browser-inspector check: the password-visibility toggle on sign-in and sign-up announces in Polish.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the manual testing was successful before considering the slice done.

---

## Testing Strategy

### Unit Tests

None added. Module 3 introduces testing strategy; this slice is verified manually plus type-check + build.

### Integration Tests

None added.

### Manual Testing Steps

1. From a fresh browser session (no cookies), visit `/` — Polish ChickenDinner hero loads.
2. Click "Zarejestruj się", complete sign-up, land on `/auth/confirm-email` (Polish copy).
3. Click "Przejdź do logowania", sign in — land directly on `/recipes`.
4. Confirm the empty-state card with disabled "Dodaj przepis" + "wkrótce".
5. Insert a recipe row via Supabase Studio (any user_id matching the signed-in user, any valid category) and refresh `/recipes` — recipe appears with its Polish category label.
6. Sign out from the Topbar — land on `/`.
7. Try `/recipes` while signed out — redirected to `/auth/signin`.
8. Try `/dashboard` (signed in or out) — 404.

## Performance Considerations

None. The page renders server-side with one indexed query (`recipes_user_id_idx` from F-01) scoped by RLS — the same shape every downstream slice will use.

## Migration Notes

No data migration. The `dashboard.astro` deletion is a code-only change. Existing user sessions remain valid; the next signin (or any navigation through the Topbar) lands users at the new home.

## References

- Roadmap entry: `context/foundation/roadmap.md` (S-01 row + Slice block)
- PRD: `context/foundation/prd.md` (FR-001 through FR-004, Non-Functional Requirements)
- F-01 plan-brief: `context/archive/2026-05-31-recipes-and-schedules-schema/plan-brief.md`
- CLAUDE.md tripwires: "User-facing copy and config-status messages are in Polish" and "Don't rename `10x-astro-starter` in `package.json`/`wrangler.jsonc`/`README.md` wholesale"
- Lessons: `context/foundation/lessons.md` — `disable_nodejs_process_v2` already applied; no infra change needed in this slice

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Recipes home and routing wire-up

#### Automated

- [ ] 1.1 Type check passes: `npx astro sync && npm run lint`
- [ ] 1.2 Production build succeeds: `npm run build`
- [ ] 1.3 Prettier check passes for changed files: `npx prettier --check src/pages/recipes.astro src/types.ts src/middleware.ts src/pages/api/auth/signin.ts src/components/Topbar.astro`

#### Manual

- [ ] 1.4 Visiting `/dashboard` while signed in returns 404
- [ ] 1.5 Visiting `/recipes` while signed out redirects to `/auth/signin`
- [ ] 1.6 Signing in via `/auth/signin` lands the user on `/recipes` (no intermediate hop to `/`)
- [ ] 1.7 A signed-in user with zero recipes sees the empty-state card with a disabled "Dodaj przepis" CTA and a visible "wkrótce" affordance
- [ ] 1.8 After inserting a recipe directly via Supabase Studio, refreshing `/recipes` shows the recipe row with its Polish category label, sorted by name
- [ ] 1.9 The Layout-level "Supabase nie jest skonfigurowany" banner still appears when env vars are removed (regression check)

### Phase 2: Polish-language ChickenDinner brand on public surfaces

#### Automated

- [ ] 2.1 Type check passes: `npx astro sync && npm run lint`
- [ ] 2.2 Production build succeeds: `npm run build`
- [ ] 2.3 Prettier check passes for changed files: `npx prettier --check src/layouts/Layout.astro src/components/Welcome.astro src/components/Topbar.astro src/pages/auth/signin.astro src/pages/auth/signup.astro src/pages/auth/confirm-email.astro src/components/auth/SignInForm.tsx src/components/auth/SignUpForm.tsx src/components/auth/PasswordToggle.tsx`
- [ ] 2.4 Grep for residual obvious English on user-visible surfaces returns expected matches only

#### Manual

- [ ] 2.5 Visiting `/` while signed out shows a Polish ChickenDinner hero with "Zaloguj się" and "Zarejestruj się" CTAs; no starter feature cards
- [ ] 2.6 Browser tab title for `/` reads "ChickenDinner"
- [ ] 2.7 `/auth/signin`, `/auth/signup`, `/auth/confirm-email` are fully Polish in headings, form labels, placeholders, button text, and footer prompts
- [ ] 2.8 Triggering client-side validation on each form (empty submit, bad email, short password, mismatched confirm) shows Polish error messages
- [ ] 2.9 Submitting valid sign-up credentials lands on `/auth/confirm-email` and reads the dev-auto-confirm Polish content in dev mode
- [ ] 2.10 Topbar in both signed-in and signed-out states is fully Polish
- [ ] 2.11 View-source on any page shows `<html lang="pl">`
- [ ] 2.12 The password-visibility toggle on sign-in and sign-up announces in Polish
