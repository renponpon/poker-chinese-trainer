import { NextResponse } from "next/server";
import {
  normalizePracticeScheduleSyncRequest,
  persistPracticeSchedule,
} from "@/application/practice/persist-practice-schedule";
import { createPracticeCloudStorage } from "@/infrastructure/server/practice-cloud-storage";
import { getBearerToken } from "@/infrastructure/server/request-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { ownerKey, schedule } = normalizePracticeScheduleSyncRequest(await req.json());
    if (!schedule) {
      return NextResponse.json({ ok: true });
    }

    const accessToken = getBearerToken(req);
    await persistPracticeSchedule({
      phrase: schedule.phrase,
      srsItem: schedule.srsItem,
      storage: createPracticeCloudStorage({ accessToken, ownerKey }),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[/api/srs/sync] error", error);
    const message =
      error instanceof Error ? error.message : "SRS同期に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
