import { describe, it, expect } from "vitest";
import { generateSchedule } from "./schedule-generator";
import type { RecipeSlot } from "./schedule-generator";

function makeRecipes(n: number): RecipeSlot[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `recipe-${i}`,
    category: "chicken" as const,
  }));
}

describe("generateSchedule", () => {
  // (a) ≥7 distinct recipes
  it("returns exactly 7 ids for a large collection", () => {
    const result = generateSchedule(makeRecipes(10));
    expect(result).toHaveLength(7);
  });

  it("fills every day (no null/undefined) for a large collection", () => {
    const result = generateSchedule(makeRecipes(10));
    result.forEach((id) => {
      expect(id).toBeTruthy();
    });
  });

  it("has no adjacent duplicates for ≥7 distinct recipes", () => {
    const result = generateSchedule(makeRecipes(10));
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).not.toBe(result[i - 1]);
    }
  });

  // (b) 3-recipe collection
  it("returns exactly 7 ids for a 3-recipe collection", () => {
    const result = generateSchedule(makeRecipes(3));
    expect(result).toHaveLength(7);
  });

  it("fills every day for a 3-recipe collection", () => {
    const result = generateSchedule(makeRecipes(3));
    result.forEach((id) => {
      expect(id).toBeTruthy();
    });
  });

  it("has no adjacent duplicates for a 3-recipe collection", () => {
    const result = generateSchedule(makeRecipes(3));
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).not.toBe(result[i - 1]);
    }
  });

  it("produces some non-adjacent repeats for a 3-recipe collection (7 days, 3 recipes)", () => {
    // With 3 recipes over 7 days, by pigeonhole at least some recipe appears ≥3 times.
    const recipes = makeRecipes(3);
    const ids = new Set(recipes.map((r) => r.id));
    const result = generateSchedule(recipes);
    const counts = new Map<string, number>();
    result.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    const hasRepeat = [...counts.values()].some((c) => c > 1);
    expect(hasRepeat).toBe(true);
    // All returned ids must come from the input set.
    result.forEach((id) => {
      expect(ids.has(id)).toBe(true);
    });
  });

  // (c) 1-recipe collection
  it("returns 7 days all equal to the single recipe id", () => {
    const recipes = makeRecipes(1);
    const result = generateSchedule(recipes);
    expect(result).toHaveLength(7);
    result.forEach((id) => {
      expect(id).toBe("recipe-0");
    });
  });

  // (d) variety: many runs over a large collection are not all identical
  it("produces varied outputs across multiple runs", () => {
    const recipes = makeRecipes(10);
    const runs = new Set<string>();
    for (let i = 0; i < 30; i++) {
      runs.add(generateSchedule(recipes).join(","));
    }
    expect(runs.size).toBeGreaterThan(1);
  });
});
