import { AsyncLocalStorage } from "node:async_hooks";

type SpeechStage = "actor" | "daily_quota" | "request_body" | "budget_reserve"
  | "provider_headers" | "audio_receive" | "stream_cleanup" | "settlement_dispatch" | "usage_record";
type SpeechMark = "first_audio_at" | "audio_done_at" | "stream_eof_at";
type SpeechTiming = { started: number; durations: Map<SpeechStage | SpeechMark | "total", number> };
const timingContext = new AsyncLocalStorage<SpeechTiming>();

export async function withSpeechTiming(task: () => Promise<Response>): Promise<Response> {
  if (process.env.PHRABIT_SPEECH_TIMING !== "1" || process.env.VERCEL_ENV === "production") return task();
  const timing: SpeechTiming = { started: performance.now(), durations: new Map() };
  return timingContext.run(timing, async () => {
    const response = await task();
    timing.durations.set("total", performance.now() - timing.started);
    response.headers.set("Server-Timing", Array.from(timing.durations,
      ([stage, milliseconds]) => `${stage};dur=${Math.max(0, milliseconds).toFixed(1)}`).join(", "));
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}

export async function measureSpeechStage<Result>(stage: SpeechStage, task: () => Promise<Result>): Promise<Result> {
  const timing = timingContext.getStore();
  if (!timing) return task();
  const started = performance.now();
  try {
    return await task();
  } finally {
    timing.durations.set(stage, (timing.durations.get(stage) ?? 0) + performance.now() - started);
  }
}

export function markSpeechStage(stage: SpeechMark): void {
  const timing = timingContext.getStore();
  if (timing && !timing.durations.has(stage)) timing.durations.set(stage, performance.now() - timing.started);
}
