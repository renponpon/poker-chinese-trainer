# SavedPhrase / DrillItem Database Migration Plan

Updated: 2026-07-07

## Current State

Current Supabase schema stores saved phrases in `public.phrases`.

- `public.phrases` contains the phrase text, explanation, category, source, and `should_drill`.
- `public.srs_items` stores review schedule state and references `public.phrases(id)` through `phrase_id`.
- Drill membership is effectively represented twice:
  - `phrases.should_drill`
  - the presence of a corresponding `srs_items` row

This is workable during migration, but it keeps `SavedPhrase` and `DrillItem` partially coupled.

## Supabase Notes Checked

Supabase changelog was checked on 2026-07-07. Relevant item:

- 2026-04-28: new public tables are no longer automatically exposed to the Data API / GraphQL API.

Migration implication:

- Every new public table must explicitly enable RLS.
- Data API exposure / grants must be verified after table creation.
- Policies should use `TO authenticated` plus ownership checks with `(select auth.uid()) = user_id`.
- UPDATE policies need both `USING` and `WITH CHECK`.

## Target Model

### `saved_phrases`

Owns library persistence only.

Suggested columns:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id) on delete cascade`
- phrase text fields: `japanese`, `chinese`, `pinyin`, `source_language`, `target_language`, `source_text`, `target_text`, `reading`, `reading_type`, `direction`
- learning metadata that belongs to saved phrase: `explanation`, `audio_url`, `category_id`, `source`, `used_at`
- timestamps: `created_at`, `updated_at`

No `should_drill` column in the final state.

### `drill_items`

Owns drill membership and schedule only.

Suggested columns:

- `saved_phrase_id uuid primary key references public.saved_phrases(id) on delete cascade`
- `user_id uuid not null references auth.users(id) on delete cascade`
- schedule fields: `status`, `next_review_at`, `interval_days`, `ease_factor`, `consecutive_good`, `last_score`, `last_reviewed_at`
- timestamps: `created_at`, `updated_at`

Membership rule:

- A saved phrase is in drill if and only if a `drill_items` row exists.
- Removing from drill deletes the `drill_items` row, not the saved phrase.

## Migration Phases

### Phase 1: Add New Tables Alongside Legacy Tables

Create `saved_phrases` and `drill_items` without removing `phrases` / `srs_items`.

Backfill:

- Insert every row from `phrases` into `saved_phrases`.
- Insert schedule rows from `srs_items` into `drill_items`.
- For legacy rows where `phrases.should_drill = true` but no `srs_items` exists, create a `drill_items` row with a new/default schedule.
- For `phrases.should_drill = false`, do not create a `drill_items` row.

### Phase 2: Dual-Read Compatibility

Infrastructure reads from new tables first.

Fallback:

- If new tables are empty for a user, read from legacy `phrases` / `srs_items`.
- Normalize into application/domain types so the UI does not know which schema supplied the data.

### Phase 3: Dual-Write Compatibility

Infrastructure writes to both schemas.

Rules:

- Saving a phrase writes `saved_phrases`.
- Adding to drill writes `drill_items`.
- Removing from drill deletes `drill_items`.
- During transition only, keep legacy `phrases.should_drill` and `srs_items` in sync for old clients.

### Phase 4: Switch Reads To New Tables Only

After deploy confidence:

- Remove fallback reads from legacy tables.
- Keep legacy writes only if older deployed clients may still exist.

### Phase 5: Drop Legacy Coupling

Final cleanup:

- Stop writing `phrases.should_drill`.
- Rename or remove legacy `phrases` / `srs_items` once no longer needed.
- Remove compatibility code from infrastructure adapters.

## RLS Policy Shape

For each new table:

```sql
alter table public.saved_phrases enable row level security;
alter table public.drill_items enable row level security;

create policy "Users can read own saved phrases"
  on public.saved_phrases for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own saved phrases"
  on public.saved_phrases for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own saved phrases"
  on public.saved_phrases for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own saved phrases"
  on public.saved_phrases for delete
  to authenticated
  using ((select auth.uid()) = user_id);
```

Repeat the same ownership policies for `drill_items`.

## Verification Checklist

- Backfill count: `saved_phrases` row count equals legacy `phrases` row count.
- Backfill count: `drill_items` row count equals legacy `srs_items` plus `should_drill=true` missing schedules.
- A library-only phrase has no `drill_items` row.
- Removing from drill deletes only `drill_items`.
- Deleting a saved phrase cascades to `drill_items`.
- Authenticated users cannot select/update/delete another user's rows.
- New tables are exposed to the Data API only if intended and with RLS enabled.

## First Safe Implementation Slice

Do not drop or rename existing tables first.

Start with:

1. Done: add `saved_phrases` and `drill_items` in `supabase/migrations/20260707104219_split_saved_phrases_and_drill_items.sql`.
2. Done: backfill from existing `phrases` and `srs_items`.
3. Done: add infrastructure readers that read the new shape first and fall back to legacy when the new tables are empty or unavailable.
4. Done: add transition dual-writes for saved phrases and drill schedule updates.
5. Done: apply the migration to the Supabase `translation-app` database through MCP and verify row counts, RLS, policies, and grants.
6. Next: add focused tests around Supabase row mapping if the adapter is split into a pure mapper plus client wrapper.

## Implementation Notes

- `public.saved_phrases` intentionally has no `should_drill` column.
- `public.drill_items` row existence represents drill membership.
- During the transition, `src/lib/supabase.ts` still writes legacy `phrases` and `srs_items` so older clients keep working.
- The new table writes ignore missing-table errors so code deployment can remain compatible with environments where the migration has not been applied yet.
- Supabase CLI and `psql` are not installed in the current workspace, so database changes were applied and verified through the Supabase MCP tools instead.
- Applied migrations in Supabase history:
  - `20260707104219_split_saved_phrases_and_drill_items`
  - `20260707104336_restrict_saved_phrase_drill_api_roles`
  - `20260707104411_restrict_saved_phrase_drill_authenticated_privileges`
  - `20260707104646_optimize_legacy_phrase_rls_policies`
- Verification on 2026-07-07: `phrases=73`, `saved_phrases=73`, `srs_items=49`, `drill_items=73`, `orphan_drill_items=0`.
- RLS is enabled for both new tables. Policies are scoped to `authenticated` with `(select auth.uid()) = user_id`, and `UPDATE` policies include both `USING` and `WITH CHECK`.
- `anon` has no table privilege on the new tables. `authenticated` has only `SELECT`, `INSERT`, `UPDATE`, and `DELETE`; `TRUNCATE` is not granted.
- Supabase advisors were run after the DDL changes. The previous `auth_rls_initplan` warnings for `phrases`, `srs_items`, and `phrase_categories` were resolved by rewriting those policies to `to authenticated` plus `(select auth.uid())`.
- Remaining advisors are outside this slice: `ai_usage_events` and `product_analytics_events` have RLS enabled with no policies, Auth leaked-password protection is disabled in project settings, and several indexes are still marked unused.
