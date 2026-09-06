import { NextResponse } from "next/server";
import {
  loadSavedPhrases,
  normalizeLoadSavedPhrasesRequest,
} from "@/application/phrase/load-saved-phrases";
import {
  normalizeAccountPhraseIds,
  normalizeAccountPhraseSnapshot,
  normalizeAccountPhraseState,
} from "@/application/phrase/account-phrase-sync";
import { createPhraseCloudReader } from "@/infrastructure/server/phrase-cloud-reader";
import {
  deleteSupabasePhrases,
  mergeSupabasePhraseSnapshot,
  replaceSupabasePhraseState,
} from "@/infrastructure/server/supabase-phrase-repository";
import { getBearerToken } from "@/infrastructure/server/request-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const accessToken = getBearerToken(req);
    const storage = createPhraseCloudReader();
    if (accessToken) {
      const snapshot = await storage.loadByAccessToken(accessToken);
      if (!snapshot) return NextResponse.json({ error: "ログイン状態を確認してください" }, { status: 401 });
      return NextResponse.json(snapshot);
    }
    const url = new URL(req.url);
    const { ownerKey } = normalizeLoadSavedPhrasesRequest({
      ownerKey: url.searchParams.get("ownerKey"),
    });
    const { phrases, srsItems } = await loadSavedPhrases({
      accessToken,
      ownerKey,
      storage,
    });
    return NextResponse.json({ phrases, srsItems });
  } catch (error) {
    console.error("[/api/phrases] error", error);
    const message =
      error instanceof Error ? error.message : "フレーズ復元に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    const snapshot = normalizeAccountPhraseSnapshot(await req.json());
    const merged = await mergeSupabasePhraseSnapshot(accessToken, snapshot);
    if (!merged) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    return NextResponse.json(merged);
  } catch (error) {
    return phraseSyncError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    const body = await req.json();
    const { phrase, srsItem } = normalizeAccountPhraseState(body);
    const updated = await replaceSupabasePhraseState(accessToken, phrase, srsItem, body.existingOnly === true);
    if (!updated) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return phraseSyncError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    const phraseIds = normalizeAccountPhraseIds(await req.json());
    const deleted = await deleteSupabasePhrases(accessToken, phraseIds);
    if (!deleted) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return phraseSyncError(error);
  }
}

function phraseSyncError(error: unknown) {
  console.error("[/api/phrases] sync error", error);
  const status =
    error && typeof error === "object" && "status" in error
      ? Number(error.status) || 500
      : 500;
  const message = error instanceof Error ? error.message : "フレーズ同期に失敗しました";
  return NextResponse.json({ error: message }, { status });
}
