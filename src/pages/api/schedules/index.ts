import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { generateSchedule } from "@/lib/services/schedule-generator";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/schedules?error=${encodeURIComponent("Supabase nie jest skonfigurowany")}`);
  }

  const { data: recipes } = await supabase.from("recipes").select("id, category");

  if (!recipes || recipes.length === 0) {
    return context.redirect(
      `/schedules?error=${encodeURIComponent("Dodaj przynajmniej jeden przepis, aby wygenerować harmonogram")}`,
    );
  }

  const ids = generateSchedule(recipes);

  const { error } = await supabase.rpc("create_schedule", { p_day_recipe_ids: ids });

  if (error) {
    console.error("create_schedule RPC failed", error);
    return context.redirect(`/schedules?error=${encodeURIComponent("Nie udało się wygenerować harmonogramu")}`);
  }

  return context.redirect("/schedules");
};
