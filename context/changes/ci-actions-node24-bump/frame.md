# Frame Brief: GitHub Actions Node 24 transition

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

An external heads-up states: "The `actions/checkout@v4` and `actions/setup-node@v4`
GitHub Actions need to be bumped to a Node.js 24–compatible version before 2026-06-02
or CI will start failing. Worth a quick v4 → v4 minor bump check before that date."

## Initial Framing (preserved)

- **User's stated cause or approach**: GitHub is removing the Node runtime these
  actions depend on; staying on the current pins will break CI on a hard deadline.
- **User's proposed direction**: A "quick v4 → v4 minor bump" of both actions,
  done before 2026-06-02.
- **Pre-dispatch narrowing**: skipped — the observation is a single, unambiguous
  claim with no competing symptoms to disambiguate. Evidence-gathering went
  straight to verifying the claim's three embedded assumptions.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Deadline semantics** — what does 2026-06-02 actually mean? ← initial framing assumes "hard failure date"
2. **Fix mechanics** — does a v4 → v4 *minor* bump change the action's Node runtime? ← initial framing assumes "yes"
3. **Repo applicability** — does *this* repo's CI actually fail after the date?
4. **Urgency / priority** — emergency before a deadline, or low-priority hygiene?

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Deadline = hard CI-failure date | GitHub Changelog: 2026-06-02 is when JS actions are **forced to run on Node 24 by default** (auto-migration); Node 20 is **removed** only on **2026-09-16**. Forced-default produces deprecation *warnings*, not failures, for maintained actions. | Initial framing **WRONG** |
| A v4 → v4 minor bump moves runtime to Node 24 | The declared runtime (`using: node20`) is tied to the action's **major** version. `checkout@v4`/`setup-node@v4` always declare node20; node24-native requires the **v5** majors. A minor v4 bump cannot change the runtime. | Initial framing **WRONG** |
| This repo's CI is at risk now | `.github/workflows/ci.yml` pins `checkout@v4` + `setup-node@v4` (build uses Node 22 via `setup-node`, unrelated to action runtime). Last CI runs 2026-05-26 both **green**; no push to `main` since, so the post-2026-06-02 forced-default hasn't even been exercised. | Real but **LOW** risk |
| Genuine urgency before 2026-06-02 | Today is **2026-06-04** — the date has already passed with zero impact. The only date with breakage potential is 2026-09-16. | Initial framing **WRONG** |

## Narrowing Signals

Decisive findings (no user-questioning round needed — evidence was conclusive):

- GitHub's own changelog defines 06-02 as forced-*default*, 09-16 as *removal*. Failure risk lives at 09-16, not 06-02.
- Action Node runtime is pinned by major version → "v4 → v4 minor" is mechanically incapable of being the fix.
- Repo CI is green and `main` hasn't been pushed since 2026-05-26; the passed deadline caused nothing.

## Cross-System Convention

The standard handling for this deprecation is a **major-version bump** of the
affected actions (`checkout@v5`, `setup-node@v5`), treated as routine maintenance
ahead of the 2026-09-16 removal — not a same-day hotfix. `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`
exists only for early opt-in testing, not as a fix.

## Reframed Problem Statement

> **The actual problem to plan around is**: routine, low-urgency CI hygiene —
> bump `actions/checkout` and `actions/setup-node` from v4 to **v5** (a major
> bump) ahead of the **2026-09-16** Node 20 removal — not an expired
> "v4 → v4 minor" emergency tied to a 2026-06-02 hard deadline.

The initial framing was wrong on three points: (1) 2026-06-02 is a forced-default
transition that yields warnings, not a failure cutoff — the real breaking date is
2026-09-16; (2) a v4 → v4 *minor* bump cannot change the Node runtime, which is
tied to the major version (the correct move is v5); (3) the deadline has already
passed with zero impact on this green-CI repo. Addressing the *reframed* problem
means a calm v5 bump (plus optional pin-to-SHA) at normal priority.

## Confidence

- **HIGH** — strong primary-source evidence (GitHub Changelog) + matches the
  ecosystem convention + corroborated by the repo's own green CI and workflow file.

## What Changes for /10x-plan

The plan is a trivial maintenance bump of two action majors (v4 → v5) in
`.github/workflows/ci.yml`, scheduled before 2026-09-16 — not an urgent minor
patch before the already-passed 2026-06-02. Arguably small enough to do directly
without a full plan.

## References

- Source file: `.github/workflows/ci.yml` (pins `actions/checkout@v4`, `actions/setup-node@v4`, build Node 22)
- CI history: `gh run list` — last runs 2026-05-26, both success, branch `main`
- GitHub Changelog: "Deprecation of Node 20 on GitHub Actions runners" (2025-09-19) — 06-02 forced default, 09-16 removal
- Investigation: evidence gathered directly (CI status + changelog); conclusive, so no TaskCreate sub-agent round was needed
