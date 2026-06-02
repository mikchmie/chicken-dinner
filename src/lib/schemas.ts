import { z } from "zod";
import { CATEGORIES } from "@/types";

export const RecipeCreateSchema = z.object({
  name: z.string().min(1, "Nazwa jest wymagana").max(200, "Nazwa może mieć maksymalnie 200 znaków"),
  category: z.enum(CATEGORIES, {
    error: () => ({ message: "Wybierz kategorię" }),
  }),
});
