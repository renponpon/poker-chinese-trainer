import { NextResponse } from "next/server";
import {
  normalizePersistSavedPhrasesRequest,
  persistSavedPhrases,
  PersistSavedPhrasesRequestError,
} from "@/application/phrase/persist-saved-phrases";
import { createPhraseCloudStorage } from "@/infrastructure/server/phrase-cloud-storage";
import { getBearerToken } from "@/infrastructure/server/request-auth";
import { identifyRequestActor } from "@/infrastructure/server/usage-limits";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const accessToken = getBearerToken(req);
    await identifyRequestActor(req, accessToken);
    const { ownerKey, nickname, phrases } = normalizePersistSavedPhrasesRequest(
      await parseRequest(req),
    );

    const result = await persistSavedPhrases({
      phrases,
      storage: createPhraseCloudStorage({ accessToken, ownerKey, nickname }),
      onError: (error, phrase) => {
        console.error("[/api/phrase/save-pack] save error", {
          phraseId: phrase.id,
          error,
        });
      },
    });

    if (result.failedPhraseIds.length) {
      return NextResponse.json({ error: "一部のフレーズを保存できませんでした", ...result }, { status: 503 });
    }
    return NextResponse.json({ ok: true, count: result.succeeded, synced: Boolean(accessToken) });
  } catch (error) {
    const status = error instanceof PersistSavedPhrasesRequestError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存に失敗しました" }, { status });
  }
}

async function parseRequest(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new PersistSavedPhrasesRequestError("JSON形式のリクエストを送ってください");
  }
}
