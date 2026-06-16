# Delete Latest Schedule — Plan Brief

> Full plan: `context/changes/delete-latest-schedule/plan.md`

## What & Why

S-06 adds the ability to delete the most recently generated schedule (FR-010). The PRD treats this as a stack operation: each delete pops the top entry, and the previous schedule becomes "most recent." It is the final must-have feature before the MVP is complete.

## Starting Point

S-03 delivered the full schedule data layer — `schedules` table with RLS, `schedule_days` with ON DELETE CASCADE, and the `/schedules` index page that already identifies `latestSchedule = schedules.at(0)`. There is no delete button or delete endpoint yet.

## Desired End State

The user sees a "Usuń harmonogram" button below the latest schedule on `/schedules`. Clicking it reveals an inline confirmation ("Tak, usuń" / "Anuluj"). Confirming submits a form POST; the page reloads with a green success banner and the previous schedule promoted to "Najnowszy harmonogram." Repeating the action clears history one entry at a time.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Confirmation UX | In-page toggle (React island) | Prevents accidental deletes without a modal or browser dialog | Plan |
| Delete mechanism | HTML form POST → server redirect | Consistent with the existing generate button pattern; works without JS | Plan |
| Delete button placement | Index page only (`/schedules`) | PRD names the index as the natural surface for "latest"; detail pages need no delete | Plan |
| Post-delete feedback | `?deleted=1` URL param → green banner | Reuses the existing `?error=` pattern from the generate endpoint | Plan |
| Server-side "latest" validation | Query latest ID and compare before delete | Enforces FR-010 stack contract even for crafted requests | Plan |

## Scope

**In scope:**
- `POST /api/schedules/[id].ts` — new delete endpoint with auth + latest-only guard
- `DeleteScheduleButton.tsx` — React island with in-page confirm toggle
- `/schedules` index page — success banner + delete button mount

**Out of scope:**
- Delete from the detail page (`/schedules/[id]`)
- Bulk delete / "clear all"
- Undo or soft delete
- New migration (schema already supports delete)

## Architecture / Approach

Single-page, server-rendered flow. The React island handles only client-side toggle state; the actual delete is a plain HTML form POST (same as the generate button). The server validates auth via `context.locals.user`, then checks the requested ID against the user's latest schedule before executing the delete. RLS and cascade handle scoping and cleanup.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Delete API endpoint | `POST /api/schedules/[id]` with auth + latest guard + cascade delete | RLS auto-scopes but the latest-ID comparison needs a careful LIMIT 1 query |
| 2. UI wiring | React toggle + success banner + index page mount | React island requires `client:load`; form action URL must match the dynamic route |

**Prerequisites:** S-03 done (schedules table, RLS, `/schedules` page) ✓  
**Estimated effort:** ~1 session across 2 phases

## Open Risks & Assumptions

- TOCTOU: if two requests race, the second delete may find nothing to delete — the endpoint should handle a null result from the latest-check gracefully (redirect with error, not a 500)
- The `schedules_owner_all` RLS policy must be active on the Supabase project (confirmed in migration `20260531164345`)

## Success Criteria (Summary)

- User can delete the latest schedule from `/schedules` with a two-step confirmation
- Deleting the last schedule shows the empty-state message (no orphaned delete button)
- A direct POST to a non-latest schedule ID returns an error redirect, not a silent delete
