# UI Domain Leak Audit

Updated: 2026-07-07

## Current Good Boundaries

- `src/app/library/LibraryView.tsx` already calls application use cases for deleting saved phrases, toggling drill membership, and syncing drill schedule.
- `src/app/drill/DrillRunner.tsx` already calls application use cases for selecting due drill phrases and recording practice results.
- API routes no longer import raw Supabase helpers, raw Gemini clients, provider SDKs, or direct `fetch`.

## Remaining UI Decisions To Move

### `src/app/add/page.tsx`

The add page still orchestrates a full workflow:

- record translation history
- save translation as saved phrase
- link the history item to the saved phrase
- decide whether the saved phrase should also enter drill via `shouldDrill`

The `shouldDrill` value is UI state, but the workflow that combines history, save, and link should become an application command such as `saveGeneratedTranslationFromAddPage`.

### `src/app/conversation/page.tsx`

The conversation page still decides and coordinates:

- selected message becomes a saved phrase
- conversation phrases are always added to drill with `shouldDrill: true`
- existing local phrases are enriched in place before being marked as in-drill
- local SRS schedule is synced after selected messages are saved
- cloud save is chunked through `/api/phrase/save-pack`

This should become an application command such as `saveConversationMessagesToDrill`, with UI passing selected message ids and adapters for local/cloud persistence.

### `src/app/drill/PersonalPhrasePackFlow.tsx`

The phrase pack UI still maps generated pack candidates into saved phrases directly:

- selected generated phrases are converted to saved phrases
- every saved phrase from this flow is marked `shouldDrill: true`
- pack explanation jobs are enqueued after save

The selection and conversion policy should move into an application command such as `saveGeneratedPhrasePackSelection`.

### `src/infrastructure/local/phrase-storage.ts`

`normalizeStoredPhrase` still contains a domain default:

```ts
shouldDrill: input.shouldDrill ?? direction === "ja-to-zh"
```

Infrastructure should not decide drill membership defaults. This should be moved to application/domain and kept only as legacy data migration compatibility if needed.

### `src/lib/srs.ts`

This file is now mostly a legacy facade over domain/application/infrastructure:

- it imports domain practice rules
- it imports application schedule use cases
- it imports local storage adapters

New UI code should import application and infrastructure modules directly. Existing imports can be migrated gradually, then this facade can be deleted or reduced to labels only.

## Safe Refactoring Order

1. Extract `saveGeneratedTranslationFromAddPage` for add-page history + save + link.
2. Extract `saveGeneratedPhrasePackSelection` for pack candidate selection and saved phrase creation.
3. Extract `saveConversationMessagesToDrill` for conversation selected-message persistence.
4. Move default drill-membership fallback out of `normalizeStoredPhrase`.
5. Remove or shrink `src/lib/srs.ts` after UI imports are migrated.

