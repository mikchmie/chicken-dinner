# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Always add disable_nodejs_process_v2 when nodejs_compat + middleware are present

- **Context**: `wrangler.jsonc` — any Cloudflare Workers project using the `@astrojs/cloudflare` adapter with a middleware file present.
- **Problem**: All SSR pages return the literal text `[object Object]` in production. The bug is invisible in `wrangler dev` / Miniflare — it only surfaces on the live Worker, making it extremely hard to catch before first deploy.
- **Rule**: Before deploying any Worker with `compatibility_date ≥ 2025-09-15` + `nodejs_compat` + a middleware file, add `"disable_nodejs_process_v2"` to `compatibility_flags` in `wrangler.jsonc`. Verify with a live URL hit — `wrangler dev` will not surface this bug.
- **Applies to**: implement, impl-review
