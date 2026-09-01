---
change_id: testing-schedule-generation-e2e
title: Testing schedule generation E2E
status: new
created: 2026-08-31
updated: 2026-08-31
archived_at: null
---

## Notes

Renamed from `testing-data-isolation`. `frame.md` in this folder documents
the original data-isolation framing decision (test-plan Phase 2 should be
integration + SQL harness, not E2E) — kept for reference, but it does not
describe this folder's current topic.

This folder is now a standalone `/10x-e2e` trial: sign in → generate a
schedule → reload the page → schedule persists (S-03, already shipped).
Not one of test-plan.md's top-6 risks; run to try out the `/10x-e2e` skill
on a real multi-boundary flow (auth → routing → API → DB → SSR reload).
