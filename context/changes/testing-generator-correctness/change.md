---
change_id: testing-generator-correctness
title: "Generator correctness & robustness: best-effort and diversity unit tests"
status: planned
created: 2026-06-16
updated: 2026-06-16
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Generator correctness & robustness".
Risks covered: #1 (generator violates best-effort contract on too-small/skewed collections — crash, refusal, or invalid schedule), #2 (diversity invariant regresses silently while the single unit test stays green).
Test types planned: unit.
Risk response intent:
- #1: prove that on 1-recipe, 3-recipe, and single-category inputs the generator returns 7 assigned days, throws nothing, and draws only from the user's collection (best-effort, never refuses).
- #2: prove the invariants hold on adversarial inputs — no two consecutive days share a meal, and same-category clustering is minimised in the documented tie-break/relaxation order; the oracle must come from the requirement, not the implementation's own output.
After creating the folder, follow the downstream continuation rule (suggest /10x-research next).
