# Delete Latest Schedule Implementation Plan

## Overview

Add S-06: a "delete latest schedule" action on the `/schedules` index page. The user clicks a button, sees an in-page confirmation toggle, then submits a form that posts to a new server endpoint. The endpoint validates the requested schedule is the user's latest (enforcing the FR-010 stack contract server-side) before deleting. On success the user is redirected with a Polish-language success banner.

## Current State Analysis

The schedule data layer from S-03 is fully in place — schema, RLS, and cascade. The `/schedules` page already splits `latestSchedule = schedules.at(0)` and `olderSchedules = schedules.slice(1)`. No delete button or delete endpoint exists yet.

**Key facts:**
- `schedules(user_id, created_at DESC)` index makes "find latest" O(1)
- RLS policy `schedules_owner_all` covers SELECT/INSERT/UPDATE/DELETE for authenticated users — the delete query needs no extra auth clause beyond RLS being active
- `schedule_days` FK `ON DELETE CASCADE` — deleting a `schedules` row cleans up its days automatically, no two-step delete needed
- Error display pattern: `?error=<encoded>` URL param → inline red banner (`schedules/index.astro:23, 67–72`)
- Generate button pattern: plain `<form method="POST">` → API redirect (`schedules/index.astro:56–63`, `api/schedules/index.ts`)

## Desired End State

The user visits `/schedules`, sees a "Usuń harmonogram" button below the latest schedule's day list. Clicking it reveals "Tak, usuń" + "Anuluj" inline (no page reload). Confirming submits a POST form; the page reloads showing the previous schedule as "Najnowszy harmonogram" and a green success banner "Harmonogram został usunięty." Repeating the operation clears history one entry at a time; deleting the last schedule shows the empty-state message with no delete button.

### Key Discoveries:

- Latest schedule: `schedules/index.astro:24` — `schedules.at(0)` after `ORDER BY created_at DESC`
- Error banner: `schedules/index.astro:23, 67–72` — `?error=` param pattern
- Generate button: `schedules/index.astro:56–63` — form POST → redirect
- Cascade: `supabase/migrations/20260531164345_create_recipes_schedules_schema.sql` — `schedule_days` ON DELETE CASCADE
- RLS: `schedules_owner_all` covers delete; user-scoped automatically

## What We're NOT Doing

- No delete button on individual detail pages (`/schedules/[id]`)
- No bulk delete or "clear all history"
- No undo / soft delete
- No new Supabase migration (schema already supports delete)
- No new TypeScript types

## Implementation Approach

Two new files + minimal edits to the index page. A React island handles the in-page toggle state; once confirmed, a standard HTML form POST is submitted (same pattern as the generate button). The server enforces the "latest only" business rule before executing the delete.

## Phase 1: Delete API endpoint

### Overview

New route `POST /api/schedules/[id].ts`. Validates auth → validates the requested ID is the user's latest schedule → deletes → redirects.

### Changes Required:

#### 1. New API route

**File**: `src/pages/api/schedules/[id].ts`

**Intent**: Handle the delete POST. The "is this the latest?" check enforces FR-010's stack semantics server-side — a crafted request cannot delete an older schedule out of order.

**Contract**:
- Export `prerender = false` and `export const POST: APIRoute`
- `context.params.id` — schedule UUID from the URL
- Auth guard: `context.locals.user` null-check → redirect to `/auth/signin`
- Supabase null-check → redirect to `/schedules?error=<encoded>`
- Latest check: `supabase.from("schedules").select("id").order("created_at", { ascending: false }).limit(1).single()` (RLS auto-scopes to current user); compare `.data.id` with `context.params.id`; if mismatch → redirect to `/schedules?error=<Polish message>`
- Delete: `supabase.from("schedules").delete().eq("id", context.params.id)` — RLS enforces ownership; cascade handles `schedule_days`
- On delete error → redirect to `/schedules?error=<encoded>`
- On success → redirect to `/schedules?deleted=1`

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes on the new file
- `npm run build` compiles without type errors

#### Manual Verification:

- POST with a valid session cookie and the latest schedule ID: schedule disappears, redirect to `/schedules?deleted=1`
- POST with the ID of an older (non-latest) schedule: redirect to `/schedules?error=...`
- POST unauthenticated: redirect to `/auth/signin`

**Implementation Note**: Verify Phase 1 manually (e.g. via the browser form or DevTools Network tab) before proceeding to Phase 2.

---

## Phase 2: UI wiring

### Overview

New `DeleteScheduleButton` React island for the in-page toggle, wired into the latest schedule block on the index page. Add a success banner for `?deleted=1`.

### Changes Required:

#### 1. DeleteScheduleButton React component

**File**: `src/components/schedules/DeleteScheduleButton.tsx`

**Intent**: Render the two-step delete toggle: initial "Usuń harmonogram" button → confirm state with "Tak, usuń" (form submit) and "Anuluj" (reset). The form POST is a standard HTML form, consistent with the generate button pattern.

**Contract**:
- Props: `{ scheduleId: string }`
- State: `confirming` (useState boolean, default `false`)
- Initial render: `<button type="button">Usuń harmonogram</button>` that sets `confirming = true` on click
- Confirm render: `<form method="post" action={`/api/schedules/${scheduleId}`}>` with two children — `<button type="submit">Tak, usuń</button>` and `<button type="button" onClick={() => setConfirming(false)}>Anuluj</button>`
- No loading state needed: the form POST triggers a full navigation, so the component unmounts naturally

#### 2. Success banner in index page

**File**: `src/pages/schedules/index.astro`

**Intent**: Surface a Polish confirmation message after a successful delete, using the same URL-param pattern as the existing error banner.

**Contract**:
- Add `const deleted = Astro.url.searchParams.get("deleted");` on the line after `const error = ...` (line 23)
- Add a green banner block immediately after the existing error banner (after line 72); render when `deleted === "1"`; text: "Harmonogram został usunięty."; style mirroring the error banner but green: `border-green-500/30 bg-green-500/10 text-green-300`

#### 3. Mount DeleteScheduleButton in the latest schedule section

**File**: `src/pages/schedules/index.astro`

**Intent**: Give the user the delete action in context — below the day list of the latest schedule.

**Contract**:
- Import `DeleteScheduleButton` from `@/components/schedules/DeleteScheduleButton`
- Inside the `latestSchedule` block (currently lines 76–89), add `<DeleteScheduleButton scheduleId={latestSchedule.id} client:load />` below the `<ul>` of days

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` compiles without errors

#### Manual Verification:

- `/schedules` with ≥ 1 schedule: "Usuń harmonogram" button visible below the latest schedule's day list
- Clicking the button: confirms toggle appears inline ("Tak, usuń" + "Anuluj"), original button disappears
- Clicking "Anuluj": single "Usuń harmonogram" button restored, no delete occurred
- Clicking "Tak, usuń": page reloads, green success banner "Harmonogram został usunięty." visible, previous schedule now shown as "Najnowszy harmonogram" (or empty-state if it was the only one)
- Deleting the last schedule: empty-state message shows, no delete button rendered
- No delete button rendered for older schedules in the history list

---

## Testing Strategy

### Manual Testing Steps:

1. Sign in, generate ≥ 2 schedules
2. Confirm "Usuń harmonogram" appears only on the latest schedule block
3. Click "Usuń harmonogram" → toggle appears; "Anuluj" restores the button without deleting
4. Click "Tak, usuń" → page reloads with success banner and list updated
5. Repeat until 0 schedules → empty state, no delete button
6. Attempt POST directly to `/api/schedules/<older-id>` (e.g. via curl or DevTools) → confirm error redirect

## Migration Notes

No migration required. The existing `ON DELETE CASCADE` and `schedules_owner_all` RLS policy handle everything.

## References

- Generate endpoint (pattern): `src/pages/api/schedules/index.ts`
- Schedule index page (banner and latest patterns): `src/pages/schedules/index.astro:23–72`
- Schema cascade: `supabase/migrations/20260531164345_create_recipes_schedules_schema.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Delete API endpoint

#### Automated

- [x] 1.1 `npm run lint` passes on the new file — f81cd79
- [x] 1.2 `npm run build` compiles without type errors — f81cd79

#### Manual

- [x] 1.3 Valid POST with latest schedule ID deletes and redirects to `/schedules?deleted=1` — f79ed7d
- [x] 1.4 POST with non-latest schedule ID redirects to `/schedules?error=...` — f79ed7d
- [x] 1.5 Unauthenticated POST redirects to `/auth/signin` — f79ed7d

### Phase 2: UI wiring

#### Automated

- [x] 2.1 `npm run lint` passes — f79ed7d
- [x] 2.2 `npm run build` compiles without errors — f79ed7d

#### Manual

- [x] 2.3 "Usuń harmonogram" button visible only on latest schedule block — f79ed7d
- [x] 2.4 Toggle works: click shows confirm state; "Anuluj" resets it — f79ed7d
- [x] 2.5 Confirmed delete: success banner shown, list updates correctly — f79ed7d
- [x] 2.6 Deleting last schedule shows empty state, no delete button — f79ed7d
- [x] 2.7 Direct POST to non-latest ID returns error redirect — f79ed7d
