import { after, NextResponse } from "next/server";
import { createPhrase } from "@/lib/notion";
import { createSupabasePhrase, getBearerToken } from "@/lib/supabase";
import { identifyRequestActor } from "@/lib/server/usage-limits";
import { RequestValidationError } from "@/lib/server/validation";
import type { Phrase } from "@/lib/types";

export const runtime = "nodejs";

type SavePackRequest = {
  ownerKey?: unknown;
  nickname?: unknown;
  phrases?: unknown;
};

export async function POST(req: Request) {
  const accessToken = getBearerToken(req);
  await identifyRequestActor(req, accessToken);
  const body = await parseRequest(req);
  const ownerKey = normalizeOptionalText(body.ownerKey, 80);
  const nickname = normalizeOptionalText(body.nickname, 80);
  const phrases = normalizePhrases(body.phrases);

  after(async () => {
    for (const phrase of phrases) {
      try {
        if (accessToken) {
          await createSupabasePhrase(accessToken, phrase);
        }
        await createPhrase({
          phraseId: phrase.id,
          japanese: phrase.japanese,
          chinese: phrase.chinese,
          pinyin: phrase.pinyin,
          explanation: phrase.explanation,
          ownerKey,
          nickname,
          direction: phrase.direction,
          categoryId: phrase.categoryId,
          shouldDrill: phrase.shouldDrill,
          source: phrase.source,
          usedAt: phrase.usedAt,
        });
      } catch (error) {
        console.error("[/api/phrase/save-pack] save error", { phraseId: phrase.id, error });
      }
    }
  });

  return NextResponse.json({ ok: true, count: phrases.length });
}

async function parseRequest(req: Request): Promise<SavePackRequest> {
  try {
    const raw = await req.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new RequestValidationError("リクエスト形式が正しくありません");
    }
    return raw as SavePackRequest;
  } catch (error) {
    if (error instanceof RequestValidationError) throw error;
    throw new RequestValidationError("JSON形式のリクエストを送ってください");
  }
}

function normalizePhrases(value: unknown): Phrase[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) {
    throw new RequestValidationError("保存するフレーズ数が正しくありません");
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new RequestValidationError("保存するフレーズの形式が正しくありません");
    }
    const phrase = item as Partial<Phrase>;
    return {
      id: normalizeText(phrase.id, "id", 80),
      japanese: normalizeText(phrase.japanese, "japanese", 500),
      chinese: normalizeText(phrase.chinese, "chinese", 500),
      pinyin: normalizeText(phrase.pinyin, "pinyin", 500),
      explanation: normalizeText(phrase.explanation, "explanation", 5000),
      audioUrl: null,
      createdAt: normalizeText(phrase.createdAt, "createdAt", 80),
      direction: "ja-to-zh",
      categoryId: normalizeOptionalText(phrase.categoryId, 64) ?? null,
      shouldDrill: true,
      source: "prototype",
      usedAt: null,
    };
  });
}

function normalizeText(value: unknown, field: string, maxChars: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestValidationError(`${field} が空です`);
  }
  return value.trim().slice(0, maxChars);
}

function normalizeOptionalText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, maxChars) : undefined;
}

