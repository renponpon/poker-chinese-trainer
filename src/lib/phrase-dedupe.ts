import type { LanguageCode, Phrase } from "./types";

export type PhraseDuplicateKind = "exact" | "near" | null;

export type PhraseDuplicateResult = {
  kind: PhraseDuplicateKind;
  matchedPhraseId: string | null;
  matchedChinese: string | null;
  score: number;
};

export function normalizeChineseForDedupe(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s。！？!?，,、；;：:“”"'‘’（）()\[\]【】《》〈〉·…\-—_]/g, "")
    .trim();
}

export function getRecentTargetHints(
  phrases: Phrase[],
  targetLanguage: LanguageCode,
  categoryIds: Array<string | null>,
  limit: number,
): string[] {
  const categorySet = new Set(categoryIds.filter(Boolean));
  const sorted = [...phrases]
    .filter((phrase) => phrase.targetLanguage === targetLanguage)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const sameCategory = sorted.filter((phrase) =>
    phrase.categoryId ? categorySet.has(phrase.categoryId) : false,
  );
  const selected = [...sameCategory, ...sorted];
  const seen = new Set<string>();
  const hints: string[] = [];

  for (const phrase of selected) {
    const targetText = phrase.targetText || phrase.chinese;
    const normalized = normalizeChineseForDedupe(targetText);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    hints.push(targetText);
    if (hints.length >= limit) break;
  }

  return hints;
}

export function getRecentChineseHints(
  phrases: Phrase[],
  categoryIds: Array<string | null>,
  limit: number,
): string[] {
  return getRecentTargetHints(phrases, "zh", categoryIds, limit);
}

export function detectDuplicateTarget(
  targetText: string,
  existingPhrases: Phrase[],
  targetLanguage: LanguageCode,
): PhraseDuplicateResult {
  return detectDuplicatePhrase(
    targetText,
    existingPhrases.filter((phrase) => phrase.targetLanguage === targetLanguage),
  );
}

export function detectDuplicatePhrase(
  chinese: string,
  existingPhrases: Phrase[],
): PhraseDuplicateResult {
  const normalized = normalizeChineseForDedupe(chinese);
  if (!normalized) return emptyResult();

  let best: PhraseDuplicateResult = emptyResult();
  for (const phrase of existingPhrases) {
    const candidate = normalizeChineseForDedupe(phrase.chinese);
    if (!candidate) continue;
    if (candidate === normalized) {
      return {
        kind: "exact",
        matchedPhraseId: phrase.id,
        matchedChinese: phrase.chinese,
        score: 1,
      };
    }

    const score = similarityScore(normalized, candidate);
    if (score > best.score) {
      best = {
        kind: score >= 0.85 || isShortNearMatch(normalized, candidate) ? "near" : null,
        matchedPhraseId: phrase.id,
        matchedChinese: phrase.chinese,
        score,
      };
    }
  }

  return best.kind ? best : emptyResult(best.score);
}

export function detectDuplicateInList(
  chinese: string,
  previousChinese: string[],
): PhraseDuplicateKind {
  const normalized = normalizeChineseForDedupe(chinese);
  if (!normalized) return null;

  for (const previous of previousChinese) {
    const candidate = normalizeChineseForDedupe(previous);
    if (!candidate) continue;
    if (candidate === normalized) return "exact";
    if (similarityScore(normalized, candidate) >= 0.85 || isShortNearMatch(normalized, candidate)) {
      return "near";
    }
  }

  return null;
}

function similarityScore(a: string, b: string): number {
  const jaccard = jaccardScore(a, b);
  const edit = 1 - levenshteinDistance(a, b) / Math.max(a.length, b.length, 1);
  return Math.max(jaccard, edit);
}

function jaccardScore(a: string, b: string): number {
  const aSet = new Set(Array.from(a));
  const bSet = new Set(Array.from(b));
  const union = new Set([...aSet, ...bSet]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const char of aSet) {
    if (bSet.has(char)) intersection += 1;
  }
  return intersection / union.size;
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
}

function isShortNearMatch(a: string, b: string): boolean {
  return Math.max(a.length, b.length) <= 12 && levenshteinDistance(a, b) <= 2;
}

function emptyResult(score = 0): PhraseDuplicateResult {
  return {
    kind: null,
    matchedPhraseId: null,
    matchedChinese: null,
    score,
  };
}
