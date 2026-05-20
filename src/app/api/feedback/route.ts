import { NextResponse } from "next/server";

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
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.FEEDBACK_TO_EMAIL;

    if (!apiKey || !to) {
      return NextResponse.json(
        {
          error:
            "フィードバック通知の環境変数（RESEND_API_KEY / FEEDBACK_TO_EMAIL）が未設定です。",
        },
        { status: 500 },
      );
    }

    const text = [
      "Poker Chinese Trainer α版フィードバック",
      "",
      `ニックネーム: ${body.nickname || "(未入力)"}`,
      `復元コード: ${body.ownerKey || "(未入力)"}`,
      `登録フレーズ数: ${body.phraseCount ?? 0}`,
      "",
      "内容",
      body.message || "(未入力)",
    ].join("\n");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Poker Chinese Trainer <onboarding@resend.dev>",
        to,
        subject: `α版フィードバック: ${body.nickname || "匿名"}`,
        text,
      }),
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
