import { NextResponse } from "next/server";
import { updatePhraseSrs } from "@/lib/notion";
import { getBearerToken, upsertSupabaseSrsItem } from "@/lib/supabase";
import type { Phrase, SrsItem } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      ownerKey?: string;
      phrase?: Phrase;
      srsItem?: SrsItem;
    };
    const ownerKey = body.ownerKey?.trim() ?? "";
    if (!body.phrase || !body.srsItem) {
      return NextResponse.json({ ok: true });
    }

    const accessToken = getBearerToken(req);
    if (accessToken) {
      await upsertSupabaseSrsItem(accessToken, body.phrase, body.srsItem);
    }

    if (!ownerKey) {
      return NextResponse.json({ ok: true });
    }

    await updatePhraseSrs({
      ownerKey,
      phrase: body.phrase,
      srsItem: body.srsItem,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[/api/srs/sync] error", error);
    const message =
      error instanceof Error ? error.message : "SRS同期に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
