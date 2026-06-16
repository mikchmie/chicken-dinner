import type { Category } from "@/types";

export interface RecipeSlot {
  id: string;
  category: Category;
}

export function generateSchedule(recipes: RecipeSlot[]): string[] {
  if (recipes.length === 0) return [];

  const DAYS = 7;
  const result: string[] = [];
  // Track the day index each recipe was last used (-1 = never used).
  const lastUsed = new Map<string, number>(recipes.map((r) => [r.id, -1]));
  const categoryOf = new Map<string, Category>(recipes.map((r) => [r.id, r.category]));

  for (let day = 0; day < DAYS; day++) {
    const previousId = day > 0 ? result[day - 1] : null;
    const previousCategory = previousId !== null ? categoryOf.get(previousId) : undefined;

    // Tier 1: exclude previous meal AND previous category.
    let candidates = recipes.filter((r) => r.id !== previousId && r.category !== previousCategory);

    // Tier 2: relax category constraint — keep meal uniqueness.
    if (candidates.length === 0) {
      candidates = recipes.filter((r) => r.id !== previousId);
    }

    // Tier 3 fallback: single-recipe collection — allow the repeat.
    if (candidates.length === 0) {
      candidates = recipes;
    }

    // Least-recently-used: pick from candidates with the lowest lastUsed value.
    const minDay = Math.min(...candidates.map((r) => lastUsed.get(r.id) ?? -1));
    const lru = candidates.filter((r) => (lastUsed.get(r.id) ?? -1) === minDay);

    // Random tie-break.
    const chosen = lru[Math.floor(Math.random() * lru.length)];
    result.push(chosen.id);
    lastUsed.set(chosen.id, day);
  }

  return result;
}
