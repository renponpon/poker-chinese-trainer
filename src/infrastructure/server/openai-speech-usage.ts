const TRANSCRIBE_INPUT_TOKEN_LIMIT = 16_000;
const TRANSCRIBE_OUTPUT_TOKEN_LIMIT = 2_000;
const TRANSCRIBE_OUTPUT_WEIGHT = 4;
const TRANSCRIBE_WEIGHTED_TOKENS_PER_UNIT = 40;

export function getTranscriptionReservationUnits(model: string, audioBytes: number): number {
  return model === "gpt-4o-transcribe"
    ? Math.ceil((TRANSCRIBE_INPUT_TOKEN_LIMIT + TRANSCRIBE_OUTPUT_WEIGHT * TRANSCRIBE_OUTPUT_TOKEN_LIMIT) / TRANSCRIBE_WEIGHTED_TOKENS_PER_UNIT)
    : Math.max(22, Math.ceil(audioBytes / 32));
}

export function getTranscriptionBudgetUnits(model: string, response: unknown): number | null {
  const data = asRecord(response);
  if (!data) return null;
  const usage = asRecord(data.usage);
  if (model === "whisper-1") {
    const seconds = usage?.type === "duration" ? usage.seconds : data.duration;
    return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 && seconds <= 2_147_483_647
      ? Math.ceil(seconds)
      : null;
  }
  if (model !== "gpt-4o-transcribe" || usage?.type !== "tokens") return null;
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const totalTokens = usage.total_tokens;
  if (!isTokenCount(inputTokens) || !isTokenCount(outputTokens) || !isTokenCount(totalTokens)
      || totalTokens === 0 || totalTokens !== inputTokens + outputTokens) return null;
  return Math.ceil((inputTokens + TRANSCRIBE_OUTPUT_WEIGHT * outputTokens) / TRANSCRIBE_WEIGHTED_TOKENS_PER_UNIT);
}

export function getSpeechBudgetUnits(model: string, value: unknown): number | null {
  if (model !== "gpt-4o-mini-tts") return null;
  const usage = asRecord(value);
  if (!usage) return null;
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const totalTokens = usage.total_tokens;
  if (!isTokenCount(inputTokens) || !isTokenCount(outputTokens) || !isTokenCount(totalTokens)
      || totalTokens === 0 || totalTokens !== inputTokens + outputTokens) return null;
  return Math.ceil(totalTokens / 30);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
}
