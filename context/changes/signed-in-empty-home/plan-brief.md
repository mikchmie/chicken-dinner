# Sign-in lands on a ChickenDinner empty recipe list — Plan Brief

> Full plan: `context/changes/signed-in-empty-home/plan.md`

## What & Why

S-01 in the roadmap. After this slice, a user can sign up, confirm, sign in, sign out, and land on a ChickenDinner-branded Polish page that lists their (empty) recipe collection. This is the slice where the generic 10x-astro-starter shell becomes the ChickenDinner app — closing FR-001 through FR-004 and the roadmap risk that "Polish-language copy lands here" (skipping it would push localization into S-02 where it competes with the first write path).

## Starting Point

F-01 is archived and the `recipes` table with per-user RLS is live; `src/types.ts` exports `Category`, `CATEGORIES`, `Recipe`. The auth scaffolding (sign-in/up/out pages + API routes, middleware) works end-to-end but every label, validation message, and `aria-label` is in English. The only protected route is `/dashboard`, a generic placeholder. `/` is the 10x-astro-starter cosmic splash with feature cards about the starter, not the product.

## Desired End State

A signed-in user lands on `/recipes` and sees a Polish empty-state card with a disabled "Dodaj przepis" CTA marked "wkrótce" (or a sorted list of their recipes with Polish category labels). The public `/`, all `/auth/*` pages, the Topbar, the form components, and the document `<html lang>` are all Polish-language and ChickenDinner-branded. `/dashboard` is gone.

## Key Decisions Made

| Decision                              | Choice                                                                              | Why (1 sentence)                                                                                          | Source |
| ------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| Localization scope                    | All user-visible surfaces (public, auth, post-signin, Topbar, form components)      | Honors the CLAUDE.md Polish-copy tripwire and the roadmap risk note; avoids pushing it into S-02.         | Plan   |
| Protected home route                  | `/recipes` (English slug, Polish copy)                                              | Readable to non-Polish devs; clean middleware swap; sets the `/schedules`-style convention for S-03.      | Plan   |
| Empty-state UX                        | Centred card + disabled "Dodaj przepis" CTA with "wkrótce"                          | Signals the next product capability without wiring a broken route; visual scaffold survives into S-02.    | Plan   |
| Public `/` vs protected home          | Separate — `/` is a public Polish landing; protected home lives at `/recipes`       | Clean separation of concerns; matches the starter's existing shape; no auth guard needed on `/`.          | Plan   |
| Sign-in success redirect              | Directly to `/recipes`                                                              | One hop; honors S-01's outcome ("after signing in see the recipe collection"); no middleware bounce.      | Plan   |
| Data fetch                            | Server-rendered in `recipes.astro` frontmatter                                      | Matches existing `dashboard.astro` pattern; RLS via server cookie; no client JS, no loading flash.        | Plan   |
| Category label localization           | Add `CATEGORY_LABELS_PL: Record<Category, string>` to `src/types.ts`                | Co-located with `CATEGORIES`; one source of truth for every future surface that shows a category name.   | Plan   |
| Welcome.astro treatment               | Keep cosmic styling; replace hero with ChickenDinner pitch; drop the feature cards  | The feature cards advertise the starter, not the product — removing them shortens the page and the diff. | Plan   |

## Scope

**In scope:**
- New protected page `src/pages/recipes.astro` (server-rendered empty/list view).
- Routing wire-up: `PROTECTED_ROUTES` update, signin redirect, Topbar protected link, `dashboard.astro` deletion.
- Polish copy + `<html lang="pl">` across `Layout.astro`, `Welcome.astro`, `Topbar.astro`, the three `/auth/*.astro` pages, `SignInForm.tsx`, `SignUpForm.tsx`, `PasswordToggle.tsx`.
- `CATEGORY_LABELS_PL` constant in `src/types.ts`.

**Out of scope:**
- Add / edit / delete recipe (S-02, S-05).
- Any schedules surface (S-03).
- Translating Supabase-emitted error strings.
- `?next=` deep-link redirect after sign-in.
- Renaming the starter in `package.json` / `wrangler.jsonc` / `README.md`.
- New shadcn primitives, new service layer, zod (zod arrives with S-02).
- Automated tests (Module 3 territory).

## Architecture / Approach

```
Guest         ──visit──▶  /  (Welcome.astro — Polish ChickenDinner hero + Zaloguj/Zarejestruj CTAs)
Guest         ──signin─▶  /api/auth/signin  ──success─▶  /recipes (was: /)
Signed-in     ──visit──▶  /recipes  (middleware → page frontmatter → supabase.from("recipes") under RLS)
                              ├─ 0 rows  → empty-state card + disabled "Dodaj przepis (wkrótce)"
                              └─ N rows  → sorted <ul> of name + CATEGORY_LABELS_PL[category]

Localization: literal strings in .astro + .tsx files. No i18n library; one slice, one language.
```

## Phases at a Glance

| Phase                                                          | What it delivers                                                                                                                                                                              | Key risk                                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1. Recipes home and routing wire-up                            | `/recipes` page with empty-state + list render, middleware swap, signin redirect, Topbar link update, `/dashboard` deletion. Polish copy on this page only. `CATEGORY_LABELS_PL` in types.ts. | Wrong empty-array fallback when `createClient` returns null could hide a misconfig — mitigated by Layout banner. |
| 2. Polish-language ChickenDinner brand on public surfaces      | Polish copy + `lang="pl"` across `Layout`, `Welcome`, `Topbar`, three auth pages, form components, password-toggle aria-labels. Drop starter feature cards from `/`.                          | Missing one English string is invisible — covered by a grep success criterion.                                  |

**Prerequisites:** F-01 archived (done); local Supabase stack reachable for manual verification (`npx supabase start`); env vars in `.env`/`.dev.vars`.

**Estimated effort:** ~1 evening session — Phase 1 is small (~5 files, no new abstractions); Phase 2 is mechanical copy edits across ~9 files.

## Open Risks & Assumptions

- The disabled "Dodaj przepis (wkrótce)" CTA assumes S-02 will land it as a real button at the same visual location. If S-02 chooses a separate "/recipes/nowy" route + page navigation, this scaffold survives unchanged (just remove `disabled`); if S-02 picks an inline modal, the button stays the trigger.
- The page treats a non-null Supabase fetch error as "render empty card". For an MVP single-user flow that's acceptable; if production surfaces flaky fetches, S-05 or a follow-up can add an error toast.
- Polish translations in the plan are starting points. The implementer is the language owner and may polish wording during implementation as long as the meaning matches.

## Success Criteria (Summary)

- A user goes sign-up → confirm-email → sign-in → `/recipes` with every page in Polish and the post-signin home showing the empty-state card.
- `npx astro sync && npm run lint`, `npm run build`, and `prettier --check` on all changed files pass.
- `grep -nE "Sign in|Sign up|Sign out|Dashboard|Welcome|10x Astro" src/pages src/components src/layouts -r` returns no user-visible English on any rendered surface (matches in `README.md`, comments, or `LibBadge.astro` are fine).
