# E2E Testing Rules

- Use getByRole, getByLabel, getByText as primary locators.
  Fall back to getByTestId only when accessibility attributes are ambiguous.
- Never use CSS selectors, XPath, or DOM structure for locating elements.
- Each test must be independently runnable — no shared state between tests.
- Never use page.waitForTimeout(). Wait for specific conditions:
  toBeVisible(), waitForURL(), waitForResponse().
- Assert the business outcome, not implementation details.
- Use unique identifiers (e.g., timestamp suffix) for test data
  to avoid collisions in parallel runs. Clean up in afterEach, or delete
  what the test created before asserting completion when the app doesn't
  yet offer a delete for that resource (note the gap in the test's header).
- Use storageState for authentication — never log in through UI
  in individual tests. See auth.setup.ts + test-user.ts.

Copied from `.claude/skills/10x-e2e/references/e2e-quality-rules.md` and reviewed
against the five anti-patterns in `.claude/skills/10x-e2e/references/e2e-anti-patterns.md`
before any new spec here is considered done.
