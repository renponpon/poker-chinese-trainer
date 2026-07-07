import { after, NextResponse } from "next/server";
import {
  generatePhraseFollowUp,
  normalizePhraseFollowUpRequest,
  PhraseFollowUpGenerationError,
  PhraseFollowUpRequestError,
} from "@/application/phrase/generate-phrase-follow-up";
import { persistPhraseFollowUp } from "@/application/phrase/persist-phrase-follow-up";
import { createPhraseFollowUpTextGenerator } from "@/infrastructure/server/phrase-explanation-generator";
import { createPhraseFollowUpCloudTargets } from "@/infrastructure/server/phrase-follow-up-cloud-storage";
import { createId } from "@/lib/id";
import { getBearerToken } from "@/infrastructure/server/request-auth";
import { recordAiUsageEvent } from "@/infrastructure/server/usage-event-recorder";
import {
  AiBurstLimitError,
  assertWithinAiBurstLimit,
  identifyRequestActor,
  UsageLimitError,
  UsageTrackingError,
  type RequestActor,
} from "@/infrastructure/server/usage-limits";
import type { PhraseDirection } from "@/lib/types";

export const runtime = "nodejs";

const ENDPOINT = "/api/phrase/explain";
const GEMINI_MODEL = "gemini-3.1-flash-lite";

class ApiRouteError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "ApiRouteError";
  }
}

export async function POST(req: Request) {
  const requestId = createId();
  let actor: RequestActor | null = null;
  let inputChars = 0;
  let outputChars = 0;
  let direction: PhraseDirection | null = null;

  try {
    const accessToken = getBearerToken(req);
    actor = await identifyRequestActor(req, accessToken);
    assertWithinAiBurstLimit(actor);

    const body = normalizePhraseFollowUpRequest(await parseRequest(req));
    const { phraseId } = body;
    direction = body.direction;
    const generatedFollowUp = await generatePhraseFollowUp({
      ...body,
      generateText: createPhraseFollowUpTextGenerator({
        model: GEMINI_MODEL,
        createMissingApiKeyError: () =>
          new ApiRouteError("GEMINI_API_KEY is not configured", 500, "missing_gemini_api_key"),
      }),
      onMissingPinyin: () => {
        console.warn("[/api/phrase/explain] pinyin missing in Gemini response");
      },
    });
    inputChars = generatedFollowUp.inputChars;

    outputChars = generatedFollowUp.outputChars;

    await recordUsage({
      requestId,
      actor,
      direction,
      inputChars,
      outputChars,
      success: true,
      errorCode: null,
    });

    after(async () => {
      await persistPhraseFollowUp({
        followUp: generatedFollowUp.followUp,
        targets: createPhraseFollowUpCloudTargets({ accessToken }),
        onError: (saveError, targetName) => {
          console.error("[/api/phrase/explain] save error", {
            requestId,
            targetName,
            saveError,
          });
        },
      });
    });

    return NextResponse.json({
      requestId,
      phraseId,
      explanation: generatedFollowUp.followUp.explanation,
      ...(generatedFollowUp.followUp.pinyin ? { pinyin: generatedFollowUp.followUp.pinyin } : {}),
    });
  } catch (error) {
    const normalized = normalizeRouteError(error);
    console.error("[/api/phrase/explain] error", {
      requestId,
      code: normalized.code,
      error,
    });
    if (error instanceof AiBurstLimitError && !error.alert.alreadyBlocked) {
      const alert = error.alert;
      after(async () => {
        const { sendAiBurstLimitAlertEmail } = await import("@/lib/server/security-alerts");
        await sendAiBurstLimitAlertEmail({
          requestId,
          endpoint: ENDPOINT,
          mode: "explain",
          source: null,
          direction,
          actorType: alert.actorType,
          userId: alert.userId,
          ipHash: alert.ipHash,
          count: alert.count,
          burstLimit: alert.burstLimit,
          windowSeconds: alert.windowSeconds,
          blockSeconds: alert.blockSeconds,
        });
      });
    }

    if (actor) {
      await recordUsage({
        requestId,
        actor,
        direction,
        inputChars,
        outputChars,
        success: false,
        errorCode: normalized.code,
      });
    }

    return NextResponse.json(
      { error: normalized.message, requestId },
      { status: normalized.status },
    );
  }
}

async function parseRequest(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new PhraseFollowUpRequestError("JSON形式のリクエストを送ってください");
  }
}

async function recordUsage(input: {
  requestId: string;
  actor: RequestActor;
  direction: PhraseDirection | null;
  inputChars: number;
  outputChars: number;
  success: boolean;
  errorCode: string | null;
}) {
  await recordAiUsageEvent({
    requestId: input.requestId,
    userId: input.actor.userId,
    actorType: input.actor.type,
    ipHash: input.actor.ipHash,
    endpoint: ENDPOINT,
    feature: "explanation",
    provider: "gemini",
    mode: "full",
    sourcePage: "add",
    direction: input.direction,
    inputChars: input.inputChars,
    outputChars: input.outputChars,
    audioDurationMs: null,
    success: input.success,
    errorCode: input.errorCode,
    model: GEMINI_MODEL,
  });
}

function normalizeRouteError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof PhraseFollowUpRequestError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof UsageLimitError || error instanceof UsageTrackingError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof ApiRouteError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof PhraseFollowUpGenerationError) {
    return { status: 502, code: error.code, message: error.message };
  }
  return {
    status: 500,
    code: "internal_error",
    message: error instanceof Error ? error.message : "サーバーエラーが発生しました",
  };
}
