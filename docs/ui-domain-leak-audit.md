# UI Domain Leak Audit

Updated: 2026-07-07

## Current Good Boundaries

- `src/app/library/LibraryView.tsx` already calls application use cases for deleting saved phrases, toggling drill membership, and syncing drill schedule.
- `src/app/drill/DrillRunner.tsx` already calls application use cases for selecting due drill phrases and recording practice results.
- API routes no longer import raw Supabase helpers, raw Gemini clients, provider SDKs, or direct `fetch`.
- `src/app/add/page.tsx` now delegates history recording, saved-phrase creation, history linking, and optional drill membership to `saveGeneratedTranslation`.
- `src/app/conversation/page.tsx` now delegates saved-phrase creation, existing phrase enrichment persistence, history linking, and drill membership to `saveConversationTranslationToDrill`.
- `src/app/drill/PersonalPhrasePackFlow.tsx` now delegates selected pack candidate persistence and drill membership to `saveGeneratedPhrasePackSelection`.
- `src/infrastructure/local/phrase-storage.ts` now defaults new saved phrases to library-only when `shouldDrill` is omitted. The old direction-based fallback is limited to legacy localStorage reads.

## Remaining UI Decisions To Move

### `src/app/add/page.tsx`

The local workflow is now application-owned. Remaining concern:

- `/api/phrase/add` still accepts the legacy `shouldDrill` flag for cloud persistence while `phrases` and `srs_items` are still coupled in the DB schema.

### `src/app/conversation/page.tsx`

The local save/drill workflow is now application-owned. Remaining concerns:

- cloud save is chunked through `/api/phrase/save-pack`
- missing reading/explanation enrichment is still driven by a UI-side fetch to `/api/phrase/explain`

These can move behind a wider application command later, with UI passing selected message ids and adapters for enrichment/cloud persistence.

### `src/app/drill/PersonalPhrasePackFlow.tsx`

The selected candidate save/drill workflow is now application-owned. Remaining concern:

- pack explanation jobs are enqueued after save

The explanation job enqueue can move behind an application command later if pack generation persistence gets more complicated.

### `src/infrastructure/local/phrase-storage.ts`

`normalizePhrase` still contains a legacy compatibility fallback:

```ts
Boolean(options.legacyDrillDefault && direction === "ja-to-zh")
```

This is intentionally limited to old localStorage records that do not have `shouldDrill`. New writes should pass an explicit value from application code or default to library-only.

### `src/lib/srs.ts`

This file has been reduced to UI labels only:

- `SRS_STATUS_GUIDE`
- `statusLabel`

New behavior code should keep importing application and infrastructure modules directly.

## Safe Refactoring Order

1. Done: extract `saveGeneratedTranslation` for add-page history + save + link + optional drill membership.
2. Done: extract `saveGeneratedPhrasePackSelection` for pack candidate selection and saved phrase creation.
3. Done: extract `saveConversationTranslationToDrill` for selected conversation message local persistence.
4. Done: move default drill-membership fallback out of new local phrase writes.
5. Done: shrink `src/lib/srs.ts` to UI labels only after UI imports were migrated.
6. Next: move conversation enrichment/cloud persistence orchestration behind application ports if it starts growing.
