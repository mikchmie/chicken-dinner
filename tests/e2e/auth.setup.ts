import { test as setup, expect } from "@playwright/test";
import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from "./test-user";

// Authenticate without the UI: POST the same form the real sign-in form submits,
// then persist the resulting Supabase session cookies so every test project that
// depends on "setup" starts already signed in (see tests/e2e/CLAUDE.md).
const authFile = "playwright/.auth/user.json";

setup("authenticate", async ({ request, baseURL }) => {
  // Astro's built-in CSRF check rejects form POSTs with no (or mismatched) Origin
  // header. A real browser sends this automatically; Playwright's standalone
  // request context does not, so it must be set explicitly here.
  const response = await request.post("/api/auth/signin", {
    form: { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD },
    headers: { origin: baseURL ?? "" },
  });
  expect(response.status(), await response.text()).toBeLessThan(400);

  const state = await request.storageState();
  expect(state.cookies.some((cookie) => cookie.name.startsWith("sb-"))).toBe(true);

  await request.storageState({ path: authFile });
});
