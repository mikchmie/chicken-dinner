import React, { useState } from "react";
import { UtensilsCrossed, Plus, CircleAlert } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { CATEGORIES, CATEGORY_LABELS_PL } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  serverError?: string | null;
}

export default function AddRecipeForm({ serverError }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [errors, setErrors] = useState<{ name?: string; category?: string }>({});

  function validate() {
    const next: typeof errors = {};

    if (!name.trim()) {
      next.name = "Nazwa jest wymagana";
    } else if (name.trim().length > 200) {
      next.name = "Nazwa może mieć maksymalnie 200 znaków";
    }

    if (!category) {
      next.category = "Wybierz kategorię";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/recipes" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label="Nazwa przepisu"
        value={name}
        onChange={(v) => {
          setName(v);
          clearError("name");
        }}
        placeholder="np. Kotlet schabowy"
        error={errors.name}
        icon={<UtensilsCrossed className="size-4" />}
      />

      <div>
        <label htmlFor="category" className="mb-1 block text-sm text-blue-100/80">
          Kategoria
        </label>
        <select
          id="category"
          name="category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            clearError("category");
          }}
          className={cn(
            "w-full appearance-none rounded-lg border bg-white/10 px-3 py-2 text-white transition-colors focus:ring-2 focus:outline-none",
            errors.category ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
          )}
        >
          <option value="" disabled>
            -- wybierz --
          </option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat} className="bg-gray-900 text-white">
              {CATEGORY_LABELS_PL[cat]}
            </option>
          ))}
        </select>
        {errors.category && (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
            <CircleAlert className="size-3" />
            {errors.category}
          </p>
        )}
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Dodawanie..." icon={<Plus className="size-4" />}>
        Dodaj przepis
      </SubmitButton>
    </form>
  );
}
