import { after, NextResponse } from "next/server";
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
  const accessToken = getBearerToken(req);
  await identifyRequestActor(req, accessToken);
  const { ownerKey, nickname, phrases } = normalizePersistSavedPhrasesRequest(
    await parseRequest(req),
  );

  after(async () => {
    await persistSavedPhrases({
      phrases,
      storage: createPhraseCloudStorage({ accessToken, ownerKey, nickname }),
      onError: (error, phrase) => {
        console.error("[/api/phrase/save-pack] save error", {
          phraseId: phrase.id,
          error,
        });
      },
    });
  });

  return NextResponse.json({ ok: true, count: phrases.length });
}

async function parseRequest(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new PersistSavedPhrasesRequestError("JSON形式のリクエストを送ってください");
  }
}
