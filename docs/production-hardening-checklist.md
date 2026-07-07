# Production Hardening Checklist

Updated: 2026-07-07

## Supabase Advisor Status

Project: `translation-app` (`whuatcawoezfrvzplmri`)

### Fixed: analytics tables with RLS but no policies

Tables:

- `public.ai_usage_events`
- `public.product_analytics_events`

Decision:

- These tables are written/read by server code through `service_role`.
- They should not be directly available to browser clients.
- Client roles now have no table privileges, and explicit deny policies exist for `anon` and `authenticated`.

Applied migration:

- `20260707112716_restrict_analytics_event_client_access`

Verified on 2026-07-07:

- `anon` / `authenticated`: no `select` or `insert` privilege on either table.
- `service_role`: `select` and `insert` privilege remain.
- RLS policies:
  - `No client access to ai usage events`
  - `No client access to product analytics events`
- Supabase security advisor no longer reports `rls_enabled_no_policy` for these tables.

### Remaining: Auth leaked password protection

Current advisor:

- `auth_leaked_password_protection` remains `WARN`.

Decision:

- This is an Auth project setting, not a SQL/RLS change.
- The available Supabase MCP tools do not expose an Auth settings update endpoint.
- Enable it from Supabase Dashboard if the project plan supports it.

Manual action:

1. Open Supabase Dashboard for `translation-app`.
2. Go to `Authentication` -> `Providers` -> `Email`.
3. Enable leaked password protection / compromised password prevention.
4. Re-run Supabase Security Advisor and confirm the warning disappears.

Reference:

- https://supabase.com/docs/guides/auth/password-security

### Reviewed: unused index INFOs

Current performance advisor still reports `unused_index` INFOs.

Decision:

- Do not drop them in this slice.
- Several are for newly introduced `saved_phrases` / `drill_items` query paths or analytics query dimensions.
- `idx_scan = 0` on a new or low-traffic table is not enough evidence to remove an index safely.

Review again after:

- At least one week of production traffic after the `saved_phrases` / `drill_items` migration.
- Running the authenticated E2E flow on production.
- Checking `pg_stat_user_indexes` and actual query paths.

Useful query:

```sql
select schemaname, relname, indexrelname, idx_scan
from pg_stat_user_indexes
where schemaname = 'public'
order by relname, indexrelname;
```

## Legacy Table Transition

Current status:

- `saved_phrases` / `drill_items` are the new domain-shaped tables.
- `phrases` / `srs_items` are still maintained for compatibility.
- Infrastructure reads new tables first and falls back to legacy when needed.
- Infrastructure dual-writes during the transition.

Do not drop legacy tables yet.

Safe retirement plan:

1. Keep dual read/write for the current production release.
2. After production E2E and a short traffic window, switch reads to new tables only while keeping legacy writes.
3. Verify no user-visible regression in save, drill add/remove, and review sync.
4. Stop legacy writes in a later release.
5. Archive or drop `phrases` / `srs_items` only after data parity and rollback needs are gone.

Readiness checks before switching reads:

```sql
select
  (select count(*) from public.phrases) as legacy_phrases,
  (select count(*) from public.saved_phrases) as saved_phrases,
  (select count(*) from public.srs_items) as legacy_srs_items,
  (select count(*) from public.drill_items) as drill_items,
  (
    select count(*)
    from public.drill_items d
    left join public.saved_phrases p on p.id = d.saved_phrase_id
    where p.id is null
  ) as orphan_drill_items;
```

## Production E2E

Manual authenticated flow:

1. Open https://phrabit.com/
2. Sign in with Google.
3. Translate one phrase.
4. Save it.
5. Add it to drill.
6. Review it once.
7. Confirm it still appears in the saved phrase list.
8. Remove it from drill and confirm the saved phrase remains.

Expected domain behavior:

- Translating alone does not create a saved phrase.
- Saving alone does not create a drill item.
- Adding to drill creates a drill item with `next_review_at`.
- Recording a practice result changes the next review date.
- Removing from drill removes only the drill item, not the saved phrase.

Automation note:

- The current production auth flow uses Google OAuth in the browser.
- This cannot be completed unattended unless a valid logged-in browser session is already available.
- If no session is available, Codex can still run public smoke checks and server/runtime checks, but the authenticated E2E needs user login.
