import { NextResponse } from "next/server";
import { submitFeedbackToGoogleForm } from "@/infrastructure/server/feedback-submitter";

export const runtime = "nodejs";

type FeedbackBody = {
  nickname?: string;
  ownerKey?: string;
  phraseCount?: number;
  message?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as FeedbackBody;
    const message = normalizeText(body.message, 2000);
    if (!message) {
      return NextResponse.json(
        { error: "フィードバック内容を入力してください。" },
        { status: 400 },
      );
    }

    const result = await submitFeedbackToGoogleForm({
      nickname: normalizeText(body.nickname, 80) || "匿名",
      message,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[/api/feedback] error", error);
    const message =
      error instanceof Error ? error.message : "フィードバック送信に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxChars);
}
