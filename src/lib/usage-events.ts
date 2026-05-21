"use client";

import { getAuthHeaders } from "./auth-headers";
import type { PhraseDirection } from "./types";

type SpeechUsageEvent = {
  sourcePage: "add" | "conversation";
  direction: PhraseDirection;
  outputChars?: number;
  audioDurationMs?: number;
  success: boolean;
  errorCode?: string | null;
};

export function recordWebSpeechUsageEvent(input: SpeechUsageEvent) {
  if (typeof window === "undefined") return;

  window.setTimeout(() => {
    void sendWebSpeechUsageEvent(input);
  }, 0);
}

async function sendWebSpeechUsageEvent(input: SpeechUsageEvent) {
  try {
    const authHeaders = await getAuthHeaders();
    await fetch("/api/usage/event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        feature: "speech_to_text",
        provider: "web_speech",
        mode: "standard",
        sourcePage: input.sourcePage,
        direction: input.direction,
        outputChars: input.outputChars ?? 0,
        audioDurationMs: input.audioDurationMs ?? null,
        success: input.success,
        errorCode: input.errorCode ?? null,
      }),
      keepalive: true,
    });
  } catch (error) {
    console.warn("[usage-events] failed to record Web Speech usage", error);
  }
}
