// Fixed E2E test account for the local/CI Supabase stack only — never a production
// credential. Seeded once via the Supabase Admin API (email pre-confirmed, so no
// mailbox step is needed):
//
//   curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
//     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
//     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
//     -H "Content-Type: application/json" \
//     -d '{"email":"e2e@chickendinner.test","password":"E2eTestPassword123!","email_confirm":true}'
//
// Re-run after `supabase db reset` / `supabase stop && supabase start` wipes local auth.
export const TEST_USER_EMAIL = "e2e@chickendinner.test";
export const TEST_USER_PASSWORD = "E2eTestPassword123!";
