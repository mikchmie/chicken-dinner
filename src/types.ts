export const CATEGORIES = ["chicken", "pork", "beef", "leguminous", "eggs", "vegetables"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  category: Category;
  created_at: string;
  updated_at: string;
}

export interface Schedule {
  id: string;
  user_id: string;
  created_at: string;
}

export interface ScheduleDay {
  schedule_id: string;
  day_index: number;
  recipe_id: string | null;
}

export interface ScheduleWithDays extends Schedule {
  days: {
    day_index: number;
    recipe: Recipe | null;
  }[];
}
