const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

export type AiBurstLimitAlertEmailInput = {
  requestId: string;
  endpoint: string;
  mode: string | null;
  source: string | null;
  direction: string | null;
  actorType: string;
  userId: string | null;
  ipHash: string | null;
  count: number;
  burstLimit: number;
  windowSeconds: number;
  blockSeconds: number;
};

export async function sendAiBurstLimitAlertEmail(
  input: AiBurstLimitAlertEmailInput,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SECURITY_ALERT_TO_EMAIL ?? process.env.FEEDBACK_TO_EMAIL;
  if (!apiKey || !to) {
    console.warn("[security-alerts] Burst alert email is not configured", {
      requestId: input.requestId,
      hasResendApiKey: Boolean(apiKey),
      hasToEmail: Boolean(to),
    });
    return false;
  }

  const from =
    process.env.SECURITY_ALERT_FROM_EMAIL ??
    process.env.FEEDBACK_FROM_EMAIL ??
    "Phrabit <onboarding@resend.dev>";
  const response = await fetch(RESEND_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `phrabit-burst-alert-${input.requestId}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject: "[Phrabit] 短時間の大量利用をブロックしました",
      text: buildBurstLimitAlertText(input),
    }),
  });

  if (!response.ok) {
    console.error("[security-alerts] Failed to send burst alert email", {
      requestId: input.requestId,
      status: response.status,
      body: await response.text().catch(() => null),
    });
    return false;
  }

  return true;
}

function buildBurstLimitAlertText(input: AiBurstLimitAlertEmailInput): string {
  return [
    "Phrabitで短時間の大量利用をブロックしました。",
    "",
    `requestId: ${input.requestId}`,
    `endpoint: ${input.endpoint}`,
    `mode: ${input.mode ?? "-"}`,
    `source: ${input.source ?? "-"}`,
    `direction: ${input.direction ?? "-"}`,
    `actorType: ${input.actorType}`,
    `userId: ${input.userId ?? "-"}`,
    `ipHash: ${input.ipHash ?? "-"}`,
    `count: ${input.count}`,
    `limit: ${input.burstLimit} requests / ${input.windowSeconds}s`,
    `blockSeconds: ${input.blockSeconds}`,
  ].join("\n");
}
