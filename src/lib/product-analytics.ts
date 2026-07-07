"use client";

import { getAuthHeaders } from "./auth-headers";
import { createId } from "./id";
import type { LanguageCode, PhraseDirection, Score } from "./types";

type ProductEventName =
  | "page_view"
  | "input_start"
  | "translation_submit"
  | "translation_success"
  | "translation_failure"
  | "drill_open"
  | "drill_answer"
  | "conversation_drill_save";

type ProductAnalyticsEvent = {
  eventName: ProductEventName;
  route?: string;
  sourcePage?: "home" | "add" | "conversation" | "drill" | "library" | "auth";
  direction?: PhraseDirection | null;
  targetLanguage?: LanguageCode | null;
  generationMode?: string | null;
  inputChars?: number;
  score?: Score | null;
  success?: boolean | null;
  errorCode?: string | null;
};

const SESSION_KEY = "phrabit-analytics-session-v1";
const CAMPAIGN_REF_KEY = "phrabit-analytics-campaign-ref-v1";

export function recordProductAnalyticsEvent(input: ProductAnalyticsEvent): void {
  if (typeof window === "undefined") return;

  window.setTimeout(() => {
    void sendProductAnalyticsEvent(input);
  }, 0);
}

function getAnalyticsSessionId(): string {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const sessionId = createId();
    window.localStorage.setItem(SESSION_KEY, sessionId);
    return sessionId;
  } catch {
    return createId();
  }
}

async function sendProductAnalyticsEvent(input: ProductAnalyticsEvent): Promise<void> {
  try {
    const authHeaders = await getAuthHeaders();
    await fetch("/api/analytics/event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        sessionId: getAnalyticsSessionId(),
        eventName: input.eventName,
        route: getAnalyticsRoute(input.route),
        sourcePage: input.sourcePage ?? getSourcePage(window.location.pathname),
        direction: input.direction ?? null,
        targetLanguage: input.targetLanguage ?? null,
        generationMode: input.generationMode ?? null,
        inputChars: input.inputChars ?? 0,
        score: input.score ?? null,
        success: input.success ?? null,
        errorCode: input.errorCode ?? null,
      }),
      keepalive: true,
    });
  } catch (error) {
    console.warn("[product-analytics] failed to record event", error);
  }
}

function getAnalyticsRoute(route?: string): string {
  const currentRoute = route ?? `${window.location.pathname}${window.location.search}`;
  const routeWithSearch =
    route && route === window.location.pathname && window.location.search
      ? `${route}${window.location.search}`
      : currentRoute;
  const campaignRef = getCampaignRef();
  if (!campaignRef || routeWithSearch.includes("ref=")) return routeWithSearch;
  return `${routeWithSearch}${routeWithSearch.includes("?") ? "&" : "?"}ref=${encodeURIComponent(campaignRef)}`;
}

function getCampaignRef(): string | null {
  const currentRef = getCurrentCampaignRef();
  if (currentRef) {
    try {
      window.localStorage.setItem(CAMPAIGN_REF_KEY, currentRef);
    } catch {
    }
    return currentRef;
  }

  try {
    return window.localStorage.getItem(CAMPAIGN_REF_KEY);
  } catch {
    return null;
  }
}

function getCurrentCampaignRef(): string | null {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  const normalizedRef = ref?.trim().slice(0, 80);
  return normalizedRef || null;
}

function getSourcePage(pathname: string): ProductAnalyticsEvent["sourcePage"] {
  if (pathname.startsWith("/conversation")) return "conversation";
  if (pathname.startsWith("/drill")) return "drill";
  if (pathname.startsWith("/library")) return "library";
  if (pathname.startsWith("/auth")) return "auth";
  return "add";
}
