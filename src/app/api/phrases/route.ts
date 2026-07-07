import { NextResponse } from "next/server";
import {
  loadSavedPhrases,
  normalizeLoadSavedPhrasesRequest,
} from "@/application/phrase/load-saved-phrases";
import { createPhraseCloudReader } from "@/infrastructure/server/phrase-cloud-reader";
import { getBearerToken } from "@/infrastructure/server/request-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const accessToken = getBearerToken(req);
    const url = new URL(req.url);
    const { ownerKey } = normalizeLoadSavedPhrasesRequest({
      ownerKey: url.searchParams.get("ownerKey"),
    });
    const { phrases, srsItems } = await loadSavedPhrases({
      accessToken,
      ownerKey,
      storage: createPhraseCloudReader(),
    });
    return NextResponse.json({ phrases, srsItems });
  } catch (error) {
    console.error("[/api/phrases] error", error);
    const message =
      error instanceof Error ? error.message : "フレーズ復元に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
