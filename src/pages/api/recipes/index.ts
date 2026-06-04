import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { RecipeCreateSchema } from "@/lib/schemas";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/recipes/new?error=${encodeURIComponent("Supabase nie jest skonfigurowany")}`);
  }

  const form = await context.request.formData();
  const raw = {
    name: form.get("name"),
    category: form.get("category"),
  };

  const result = RecipeCreateSchema.safeParse(raw);
  if (!result.success) {
    return context.redirect(`/recipes/new?error=${encodeURIComponent(result.error.issues[0].message)}`);
  }

  const { error } = await supabase
    .from("recipes")
    .insert({ name: result.data.name, category: result.data.category, user_id: user.id });

  if (error) {
    console.error("recipes.insert failed", error);
    return context.redirect(`/recipes/new?error=${encodeURIComponent("Nie udało się dodać przepisu")}`);
  }

  return context.redirect("/recipes");
};
