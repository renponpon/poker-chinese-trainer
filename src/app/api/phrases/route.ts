import { NextResponse } from "next/server";
import { getPhrasesByOwner } from "@/lib/notion";
import { getBearerToken, getSupabasePhrasesByUser } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const accessToken = getBearerToken(req);
    if (accessToken) {
      const cloud = await getSupabasePhrasesByUser(accessToken);
      if (cloud) return NextResponse.json(cloud);
    }

    const url = new URL(req.url);
    const ownerKey = url.searchParams.get("ownerKey")?.trim() ?? "";
    if (!ownerKey) {
      return NextResponse.json({ phrases: [], srsItems: [] });
    }

    const { phrases, srsItems } = await getPhrasesByOwner(ownerKey);
    return NextResponse.json({ phrases, srsItems });
  } catch (error) {
    console.error("[/api/phrases] error", error);
    const message =
      error instanceof Error ? error.message : "フレーズ復元に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
