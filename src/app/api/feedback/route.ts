import { NextResponse } from "next/server";

export const runtime = "nodejs";

const GOOGLE_FORM_RESPONSE_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdQ7D8vweIA798viydmvW37Yj_aMAMZSvKsIX3SvoZ9bGEUfA/formResponse";
const GOOGLE_FORM_NAME_ENTRY = "entry.1054141803";
const GOOGLE_FORM_MESSAGE_ENTRY = "entry.131084111";

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

    const response = await fetch(GOOGLE_FORM_RESPONSE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: buildGoogleFormBody(body, message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[/api/feedback] error", error);
    const message =
      error instanceof Error ? error.message : "フィードバック送信に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildGoogleFormBody(body: FeedbackBody, message: string): string {
  const params = new URLSearchParams();
  params.set(
    GOOGLE_FORM_NAME_ENTRY,
    normalizeText(body.nickname, 80) || "匿名",
  );
  params.set(GOOGLE_FORM_MESSAGE_ENTRY, message);
  return params.toString();
}

function normalizeText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxChars);
}
