// Seed exemplar for ChickenDinner's E2E layer — see
// .claude/skills/10x-e2e/references/seed-test-pattern.md. Every later generated
// spec is modeled on this file's shape (role-based locators, self-contained
// setup/action/assertion/cleanup, wait-for-state, a risk-tied name).
//
// This is also the first (and, for this trial, only) risk-tied test the /10x-e2e
// skill produced. It is NOT one of context/foundation/test-plan.md's top-6 risks —
// those were deliberately scoped to unit/integration (see
// context/changes/testing-schedule-generation-e2e/frame.md and change.md). It
// exists to try out the skill against a real, already-shipped (S-03) flow that
// genuinely crosses auth -> routing -> API -> DB -> SSR reload.
//
// Risk: a generated schedule must survive a real SSR page reload. The schedule
// list is server-rendered from Supabase on every request (src/pages/schedules/
// index.astro), not cached client-side — a regression here would silently drop
// or corrupt what the user just generated the moment they refresh the page.

import { test, expect } from "@playwright/test";

test("generated schedule persists after page reload", async ({ page }) => {
  // Setup: this account needs at least one recipe before it can generate a
  // schedule (POST /api/schedules redirects with an error otherwise). Recipe
  // delete (roadmap S-05) hasn't shipped yet, so this recipe can't be cleaned
  // up afterward; the timestamped name only keeps repeat runs legible, since
  // recipes.name has no uniqueness constraint to collide with.
  const recipeName = `E2E Recipe ${Date.now()}`;
  await page.goto("/recipes/new");
  // AddRecipeForm is a client:load React island — the SSR markup is interactive
  // before its event handlers attach, so wait for that to settle or the fill
  // below lands before React's onChange is wired up and validation blocks submit.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Nazwa przepisu").fill(recipeName);
  await page.getByLabel("Kategoria").selectOption({ label: "Kurczak" });
  await page.getByRole("button", { name: "Dodaj przepis" }).click();
  await expect(page.getByText(recipeName)).toBeVisible();

  // Action: generate a schedule
  await page.goto("/schedules");
  await page.getByRole("button", { name: "Generuj harmonogram" }).click();
  await expect(page.getByRole("heading", { name: "Najnowszy harmonogram" })).toBeVisible();

  const dayRows = page.getByRole("listitem").filter({ hasText: "Dzień" });
  await expect(dayRows).toHaveCount(7);
  const beforeReload = await dayRows.allTextContents();

  // Assert: the same schedule survives a real reload, not a client-side cache
  await page.reload();
  await expect(page.getByRole("heading", { name: "Najnowszy harmonogram" })).toBeVisible();
  const afterReload = await page.getByRole("listitem").filter({ hasText: "Dzień" }).allTextContents();
  expect(afterReload).toEqual(beforeReload);

  // Cleanup: delete the schedule this test generated (the app supports this).
  // DeleteScheduleButton is also a client:load island — same hydration wait applies.
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Usuń harmonogram" }).click();
  await page.getByRole("button", { name: "Tak, usuń" }).click();
  await expect(page.getByText("Harmonogram został usunięty.")).toBeVisible();
});
