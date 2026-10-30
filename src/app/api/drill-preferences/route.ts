import { NextRequest, NextResponse } from "next/server";
import { drillPreferencesRepositoryForToken } from "@/infrastructure/server/supabase-drill-preferences-repository";
import { synchronizeDrillPreferences } from "@/infrastructure/server/drill-preferences-service";

export async function POST(request: NextRequest) {
  const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return reply({ ok: false }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return reply({ ok: false }, 403);
  if (Number(request.headers.get("content-length")) > 1000) return reply({ ok: false }, 413);
  let body: unknown;
  try { const raw = await request.text(); if (raw.length > 1000) return reply({ ok: false }, 413); body = JSON.parse(raw); }
  catch { return reply({ ok: false }, 400); }
  try {
    const account = await drillPreferencesRepositoryForToken(token);
    if (!account) return reply({ ok: false }, 401);
    return reply(await synchronizeDrillPreferences(account.userId, body, account.repository));
  } catch (error) {
    return reply({ ok: false }, error instanceof Error && error.message === "invalid_request" ? 400 : 503);
  }
}
