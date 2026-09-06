import assert from "node:assert/strict";
import test from "node:test";
import { reconcileAccountPhraseData } from "./reconcile-account-phrase-data";
import type { SavedPhraseSnapshot } from "./load-saved-phrases";
import { STARTER_PHRASES } from "../../lib/starter-phrases";
import type { Phrase, SrsItem } from "../../lib/types";

const phrase = { ...STARTER_PHRASES[0], explanation: "base", categoryId: "other" };
const empty: SavedPhraseSnapshot = { phrases: [], srsItems: [] };
const snapshot = (phrases: Phrase[], srsItems: SrsItem[] = []): SavedPhraseSnapshot => ({ phrases, srsItems });

test("does not resurrect a remote deletion when the local copy was unchanged", () => {
  const result = reconcileAccountPhraseData(snapshot([phrase]), snapshot([phrase]), empty);
  assert.deepEqual(result.snapshot, empty);
  assert.deepEqual(result.mutations, []);
});

test("retains unsent additions and retries the same ID without duplication", () => {
  const first = reconcileAccountPhraseData(empty, snapshot([phrase]), empty);
  assert.equal(first.mutations[0]?.kind, "save");
  const retry = reconcileAccountPhraseData(empty, snapshot([phrase]), snapshot([phrase]));
  assert.equal(retry.snapshot.phrases.length, 1);
  assert.deepEqual(retry.mutations, []);
});

test("retries a local deletion and accepts a deletion already applied", () => {
  assert.deepEqual(reconcileAccountPhraseData(snapshot([phrase]), empty, snapshot([phrase])).mutations, [{ kind: "delete", id: phrase.id }]);
  assert.deepEqual(reconcileAccountPhraseData(snapshot([phrase]), empty, empty).mutations, []);
});

test("merges only edited fields and preserves unrelated remote changes", () => {
  const result = reconcileAccountPhraseData(snapshot([phrase]), snapshot([{ ...phrase, explanation: "local" }]), snapshot([{ ...phrase, categoryId: "work" }]));
  assert.equal(result.snapshot.phrases[0].explanation, "local");
  assert.equal(result.snapshot.phrases[0].categoryId, "work");
  assert.equal(result.mutations[0]?.kind === "save" && result.mutations[0].existingOnly, true);
});

test("holds edits to a remotely deleted phrase locally without sending an upsert", () => {
  const local = { ...phrase, explanation: "unsynced" };
  const result = reconcileAccountPhraseData(snapshot([phrase]), snapshot([local]), empty);
  assert.deepEqual(result.snapshot.phrases, [local]);
  assert.deepEqual(result.conflicts, [phrase.id]);
  assert.deepEqual(result.mutations, []);
});

test("keeps a newer remote review when an older local review is pending", () => {
  const item = (time: number): SrsItem => ({ id: phrase.id, status: "review", nextReviewAt: time + 10000, intervalDays: 2, easeFactor: 2.5, consecutiveGood: 2, lastScore: 2, lastReviewedAt: time });
  const result = reconcileAccountPhraseData(snapshot([phrase], [item(100)]), snapshot([phrase], [item(200)]), snapshot([phrase], [item(300)]));
  assert.equal(result.snapshot.srsItems[0]?.lastReviewedAt, 300);
  assert.deepEqual(result.mutations, []);
});

test("removing drill membership is not undone by a remote schedule", () => {
  const result = reconcileAccountPhraseData(snapshot([phrase]), snapshot([{ ...phrase, shouldDrill: false }]), snapshot([phrase]));
  assert.equal(result.snapshot.phrases[0].shouldDrill, false);
  assert.deepEqual(result.snapshot.srsItems, []);
});

test("retains edits and deletions made while an earlier request was in flight", () => {
  const submitted = { ...phrase, explanation: "submitted" };
  const later = { ...submitted, explanation: "newer" };
  const result = reconcileAccountPhraseData(snapshot([submitted]), snapshot([later]), snapshot([submitted]));
  assert.equal(result.snapshot.phrases[0].explanation, "newer");
  assert.equal(result.mutations.length, 1);
  assert.deepEqual(reconcileAccountPhraseData(snapshot([submitted]), empty, snapshot([submitted])).mutations, [{ kind: "delete", id: phrase.id }]);
});
