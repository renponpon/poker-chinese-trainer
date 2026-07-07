import { NextResponse } from "next/server";
import {
  assertPhraseExplanationProviderConfigured,
  createPhrasePackExplanationTextGenerator,
} from "@/infrastructure/server/phrase-explanation-generator";
import {
  generatePhrasePackExplanationList,
  normalizePhrasePackExplanationRequest,
  PhrasePackExplanationRequestError,
} from "@/application/phrase/generate-phrase-pack-explanations";
import { createId } from "@/lib/id";
import {
  PACK_EXPLANATION_GEMINI_MODEL,
} from "@/lib/pack-explanation";
import {
  assertValidPhrasePackRequest,
  identifyRequestActor,
  PhrasePackRequestError,
  UsageTrackingError,
} from "@/infrastructure/server/usage-limits";
import { getBearerToken } from "@/infrastructure/server/request-auth";

export const runtime = "nodejs";

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

  try {
    const accessToken = getBearerToken(req);
    const actor = await identifyRequestActor(req, accessToken);
    const body = await parseRequest(req);
    const { packRequestId, phrases } = normalizePhrasePackExplanationRequest(body);

    await assertValidPhrasePackRequest(actor, packRequestId);

    assertPhraseExplanationProviderConfigured({
      createMissingApiKeyError: () =>
        new ApiRouteError("GEMINI_API_KEY is not configured", 500, "missing_gemini_api_key"),
    });
    const explanations = await generatePhrasePackExplanationList({
      phrases,
      generateText: createPhrasePackExplanationTextGenerator({
        model: PACK_EXPLANATION_GEMINI_MODEL,
        createMissingApiKeyError: () =>
          new ApiRouteError("GEMINI_API_KEY is not configured", 500, "missing_gemini_api_key"),
      }),
    });

    return NextResponse.json({
      requestId,
      packRequestId,
      explanations,
    });
  } catch (error) {
    const normalized = normalizeRouteError(error);
    console.error("[/api/phrase/generate-pack/explain] error", {
      requestId,
      code: normalized.code,
      error,
    });
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
    throw new PhrasePackExplanationRequestError("JSON形式のリクエストを送ってください");
  }
}

function normalizeRouteError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof PhrasePackExplanationRequestError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof UsageTrackingError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof PhrasePackRequestError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof ApiRouteError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  return {
    status: 500,
    code: "internal_error",
    message: error instanceof Error ? error.message : "サーバーエラーが発生しました",
  };
}
