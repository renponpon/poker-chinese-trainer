import { loadLocalPhrases, updateLocalPhrase } from "@/infrastructure/local/phrase-storage";
import { currentDataOwner } from "@/infrastructure/local/account-cache-storage";
import { getAuthHeaders } from "./auth-headers";
import { syncSavedPhrases } from "./account-phrase-sync";
import type { Phrase } from "./types";

const pending = new Map<string, Promise<void>>();

export function completeSavedExplanation(
  phrase: Phrase,
  existingTask?: Promise<Partial<Pick<Phrase, "explanation" | "pinyin" | "reading">>>,
): Promise<void> {
  const owner = currentDataOwner();
  const key = owner + ":" + phrase.id;
  const existing = pending.get(key);
  if (existing) return existing;
  const task = (async () => {
    const enriched = existingTask ? await existingTask : await generate(phrase, owner);
    if (currentDataOwner() !== owner) return;
    const current = loadLocalPhrases().find((item) => item.id === phrase.id);
    if (!current || current.sourceText !== phrase.sourceText || current.targetText !== phrase.targetText) return;
    const updates = {
      explanation: enriched.explanation || current.explanation,
      pinyin: enriched.pinyin || current.pinyin,
      reading: enriched.reading || enriched.pinyin || current.reading,
    };
    const saved = updateLocalPhrase(phrase.id, updates).find((item) => item.id === phrase.id);
    window.dispatchEvent(new Event("phrabit-phrases-updated"));
    if (saved) await syncSavedPhrases([saved]);
  })().catch((error) => {
    console.warn("[saved-phrase-explanation] フレーズは端末に保存済みです", error);
  }).finally(() => { pending.delete(key); });
  pending.set(key, task);
  return task;
}

async function generate(phrase: Phrase, owner: string): Promise<Partial<Phrase>> {
  const headers = await getAuthHeaders();
  if (currentDataOwner() !== owner) throw new Error("アカウントが変わったため解説生成を中止しました");
  const response = await fetch("/api/phrase/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ ...phrase, phraseId: phrase.id }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "解説生成に失敗しました");
  return data;
}
