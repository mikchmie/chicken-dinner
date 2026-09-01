import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

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

  const scheduleId = context.params.id;
  if (!scheduleId) {
    return context.redirect(`/schedules?error=${encodeURIComponent("Nieprawidłowy identyfikator harmonogramu")}`);
  }

  const { data: latest, error: latestError } = await supabase
    .from("schedules")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (latestError ?? !latest) {
    return context.redirect(`/schedules?error=${encodeURIComponent("Nie znaleziono harmonogramu do usunięcia")}`);
  }

  if (latest.id !== scheduleId) {
    return context.redirect(`/schedules?error=${encodeURIComponent("Można usunąć tylko najnowszy harmonogram")}`);
  }

  const { error: deleteError } = await supabase.from("schedules").delete().eq("id", scheduleId);

  if (deleteError) {
    console.error("schedule delete failed", deleteError);
    return context.redirect(`/schedules?error=${encodeURIComponent("Nie udało się usunąć harmonogramu")}`);
  }

  return context.redirect("/schedules?deleted=1");
};
