import { after, NextResponse } from "next/server";
import { ExperiencePhraseValidationError, validateExperiencePhraseRequest, type ExperiencePhraseRequest } from "@/lib/experience-phrase";
import { createExperienceMockResponse, ExperienceMockUnavailableError } from "@/infrastructure/server/experience-phrase-mock";
import { EXPERIENCE_GEMINI_MODEL, ExperiencePhraseGenerationError, generateExperiencePhrase, getExperienceGenerationMode } from "@/infrastructure/server/experience-phrase-generator";
import { AiBudgetError } from "@/infrastructure/server/ai-budget";
import { getBearerToken } from "@/infrastructure/server/request-auth";
import { assertWithinAiBurstLimit, assertWithinDailyAiLimit, identifyRequestActor, UsageLimitError, UsageTrackingError, type RequestActor } from "@/infrastructure/server/usage-limits";
import { recordAiUsageEvent } from "@/infrastructure/server/usage-event-recorder";
import { withDeferredBudgetSettlement } from "@/lib/server/with-ai-budget-settlements";
import { RequestStoppedError } from "@/lib/timed-request";
import { createId } from "@/lib/id";
import { buildDirection } from "@/lib/languages";

export const runtime = "nodejs";

export const POST = withDeferredBudgetSettlement(handlePost);

async function handlePost(request: Request) {
  const mode = getExperienceGenerationMode(process.env);
  if (mode === "disabled") return NextResponse.json({ error: "出来事から一言を作る機能は準備中です。" }, { status: 503 });
  const requestId = createId();
  let actor: RequestActor | null = null;
  let input: ExperiencePhraseRequest | null = null;
  let attempted = false;
  let outputChars = 0;
  let errorCode: string | null = null;
  try {
    let raw: unknown;
    try { raw = await request.json(); } catch { throw new ExperiencePhraseValidationError("JSON形式で送信してください。"); }
    input = validateExperiencePhraseRequest(raw);
    if (mode === "mock") return NextResponse.json(createExperienceMockResponse(input), { headers: { "Cache-Control": "no-store" } });
    actor = await identifyRequestActor(request, getBearerToken(request));
    assertWithinAiBurstLimit(actor);
    await assertWithinDailyAiLimit(actor);
    attempted = true;
    const result = await generateExperiencePhrase(input);
    outputChars = result.status === "ready" ? result.phrase.sourceText.length + result.phrase.targetText.length : 0;
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    let status = 502;
    let message = "一言を作れませんでした。入力はそのままで再度お試しください。";
    errorCode = "experience_generation_failed";
    if (error instanceof ExperiencePhraseValidationError || error instanceof ExperienceMockUnavailableError) {
      status = error.status;
      message = error.message;
      errorCode = "invalid_experience_request";
    } else if (error instanceof AiBudgetError || error instanceof RequestStoppedError || error instanceof ExperiencePhraseGenerationError || error instanceof UsageLimitError || error instanceof UsageTrackingError) {
      status = error.status;
      message = error.message;
      errorCode = error instanceof UsageTrackingError ? "usage_tracking_unavailable" : error.code;
    }
    console.error("[/api/phrase/from-experience] request failed", { requestId, code: errorCode });
    return NextResponse.json({ error: message }, { status });
  } finally {
    if (mode === "gemini" && actor && input && attempted) {
      const usage = { requestId, userId: actor.userId, actorType: actor.type, ipHash: actor.ipHash, endpoint: "/api/phrase/from-experience", feature: "translation" as const, provider: "gemini" as const, mode: "quality", sourcePage: "add" as const, direction: buildDirection("ja", input.targetLanguage), inputChars: input.experienceText.length + input.nuance.length + (input.previousPhrase?.sourceText.length ?? 0) + (input.previousPhrase?.targetText.length ?? 0), outputChars, audioDurationMs: null, success: errorCode === null, errorCode, model: EXPERIENCE_GEMINI_MODEL };
      after(async () => {
        try { await recordAiUsageEvent(usage); } catch { console.error("[/api/phrase/from-experience] usage record failed", { requestId }); }
      });
    }
  }
}
