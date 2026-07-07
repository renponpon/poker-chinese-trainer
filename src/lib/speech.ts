import { getAuthHeaders } from "@/lib/auth-headers";

let voicesListenerAttached = false;
let activeSession: SpeechPlayOptions | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let speakTimer: number | null = null;
let activeAudio: HTMLAudioElement | null = null;
const remoteSpeechCache = new Map<string, string>();
const remoteSpeechPending = new Map<string, Promise<string>>();

export type SpeechPlayOptions = {
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
};

function getVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return [];
  }
  return window.speechSynthesis.getVoices();
}

function normalizeLang(lang: string): string {
  return lang.toLowerCase().replace("_", "-");
}

function scoreLangVoice(voice: SpeechSynthesisVoice, preferredLang: string): number {
  const lang = normalizeLang(voice.lang);
  const preferred = normalizeLang(preferredLang);
  let score = 0;
  if (lang === preferred || lang.startsWith(preferred)) score += 100;
  else if (lang.startsWith(preferred.split("-")[0])) score += 40;
  if (voice.localService) score += 30;
  return score;
}

function scoreZhVoice(voice: SpeechSynthesisVoice): number {
  const lang = normalizeLang(voice.lang);
  let score = 0;
  if (lang === "zh-cn" || lang.startsWith("zh-cn")) score += 100;
  else if (lang.startsWith("zh") || lang.startsWith("cmn")) score += 40;
  if (voice.localService) score += 30;
  return score;
}

function getVoiceForLang(langCode: string): SpeechSynthesisVoice | null {
  const normalized = normalizeLang(langCode);
  const language = normalized.split("-")[0];
  const voices = getVoices()
    .filter((voice) => normalizeLang(voice.lang).startsWith(language))
    .sort((a, b) => scoreLangVoice(b, normalized) - scoreLangVoice(a, normalized));
  return voices[0] ?? null;
}

function getZhVoiceCandidates(): SpeechSynthesisVoice[] {
  return getVoices()
    .filter((voice) => {
      const lang = normalizeLang(voice.lang);
      return lang.startsWith("zh") || lang.startsWith("cmn");
    })
    .sort((a, b) => scoreZhVoice(b) - scoreZhVoice(a));
}

function getJaVoice(): SpeechSynthesisVoice | null {
  const jaVoices = getVoices().filter((voice) =>
    normalizeLang(voice.lang).startsWith("ja"),
  );
  return (
    jaVoices.find((voice) => normalizeLang(voice.lang) === "ja-jp") ??
    jaVoices[0] ??
    null
  );
}

function endActiveSession() {
  if (speakTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(speakTimer);
    speakTimer = null;
  }
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
  activeUtterance = null;
  activeSession?.onEnd?.();
  activeSession = null;
}

function speakNow(utter: SpeechSynthesisUtterance, opts: SpeechPlayOptions): void {
  const synth = window.speechSynthesis;
  synth.cancel();
  activeUtterance = utter;
  getVoices();
  speakTimer = window.setTimeout(() => {
    speakTimer = null;
    if (activeSession !== opts || activeUtterance !== utter) return;
    synth.resume();
    synth.speak(utter);
  }, 80);
}

function bindUtterance(
  utter: SpeechSynthesisUtterance,
  opts: SpeechPlayOptions,
  onFail: () => void,
) {
  let started = false;

  utter.onstart = () => {
    if (started) return;
    started = true;
    opts.onStart?.();
  };
  utter.onend = () => {
    if (activeSession === opts) {
      activeSession = null;
    }
    if (activeUtterance === utter) {
      activeUtterance = null;
    }
    opts.onEnd?.();
  };
  utter.onerror = (event) => {
    if (activeUtterance === utter) {
      activeUtterance = null;
    }
    if (event.error === "canceled") return;
    onFail();
  };
}

export function stopSpeech(): void {
  endActiveSession();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

export function primeSpeech(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  getVoices();

  if (!voicesListenerAttached) {
    voicesListenerAttached = true;
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      getVoices();
    });
  }
}

export function playChinese(text: string, opts: SpeechPlayOptions = {}): void {
  if (typeof window === "undefined") return;
  if (!text) return;
  if (!("speechSynthesis" in window)) return;

  endActiveSession();
  activeSession = opts;

  const candidates = getZhVoiceCandidates();
  let voiceIndex = 0;

  const finish = () => {
    if (activeSession === opts) {
      activeSession = null;
    }
    opts.onEnd?.();
  };

  const attempt = () => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "zh-CN";
    utter.rate = opts.rate ?? 0.9;
    utter.pitch = 1.0;

    if (voiceIndex < candidates.length) {
      utter.voice = candidates[voiceIndex];
    }

    bindUtterance(utter, opts, () => {
      voiceIndex += 1;
      if (voiceIndex <= candidates.length) {
        attempt();
      } else {
        finish();
      }
    });

    speakNow(utter, opts);
  };

  attempt();
}

export function playJapanese(text: string, opts: SpeechPlayOptions = {}): void {
  if (typeof window === "undefined") return;
  if (!text) return;
  if (!("speechSynthesis" in window)) return;

  endActiveSession();
  activeSession = opts;

  const utter = new SpeechSynthesisUtterance(text);
  const voice = getJaVoice();
  if (voice) utter.voice = voice;
  utter.lang = "ja-JP";
  utter.rate = opts.rate ?? 0.95;
  utter.pitch = 1.0;

  bindUtterance(utter, opts, finish);
  speakNow(utter, opts);

  function finish() {
    if (activeSession === opts) {
      activeSession = null;
    }
    opts.onEnd?.();
  }
}

export function playSpeechForLang(
  text: string,
  langCode: string,
  opts: SpeechPlayOptions = {},
): void {
  if (langCode.toLowerCase().startsWith("zh")) {
    playChinese(text, opts);
    return;
  }
  if (langCode.toLowerCase().startsWith("ja")) {
    playJapanese(text, opts);
    return;
  }
  if (shouldUseRemoteSpeech(langCode)) {
    playRemoteSpeech(text, langCode, opts);
    return;
  }
  playBrowserSpeechForLang(text, langCode, opts);
}

export function prefetchSpeechForLang(text: string, langCode: string): void {
  if (typeof window === "undefined") return;
  if (!text) return;
  if (!shouldUseRemoteSpeech(langCode)) return;

  void getRemoteSpeechSrc(text, langCode).catch(() => undefined);
}

function playBrowserSpeechForLang(
  text: string,
  langCode: string,
  opts: SpeechPlayOptions = {},
): void {
  if (typeof window === "undefined") return;
  if (!text) return;
  if (!("speechSynthesis" in window)) return;

  endActiveSession();
  activeSession = opts;

  const utter = new SpeechSynthesisUtterance(text);
  const voice = getVoiceForLang(langCode);
  if (voice) utter.voice = voice;
  utter.lang = langCode;
  utter.rate = opts.rate ?? 0.95;
  utter.pitch = 1.0;

  bindUtterance(utter, opts, finish);
  speakNow(utter, opts);

  function finish() {
    if (activeSession === opts) {
      activeSession = null;
    }
    opts.onEnd?.();
  }
}

function shouldUseRemoteSpeech(langCode: string): boolean {
  void langCode;
  return false;
}

function playRemoteSpeech(
  text: string,
  langCode: string,
  opts: SpeechPlayOptions,
): void {
  if (typeof window === "undefined") return;
  if (!text) return;

  endActiveSession();
  activeSession = opts;

  void (async () => {
    try {
      const src = await getRemoteSpeechSrc(text, langCode);
      if (activeSession !== opts) return;
      const audio = new Audio(src);
      activeAudio = audio;
      audio.onplay = () => opts.onStart?.();
      audio.onended = () => {
        if (activeAudio === audio) activeAudio = null;
        if (activeSession === opts) activeSession = null;
        opts.onEnd?.();
      };
      audio.onerror = () => {
        if (activeAudio === audio) activeAudio = null;
        if (activeSession === opts) {
          activeSession = null;
          playBrowserSpeechForLang(text, langCode, opts);
        }
      };
      await audio.play();
    } catch {
      if (activeSession === opts) {
        activeSession = null;
        playBrowserSpeechForLang(text, langCode, opts);
      }
    }
  })();
}

async function getRemoteSpeechSrc(text: string, langCode: string): Promise<string> {
  const cacheKey = `${langCode}:${hashSpeechText(text)}`;
  const cached = remoteSpeechCache.get(cacheKey);
  if (cached) return cached;
  const pending = remoteSpeechPending.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/speech/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ text, langCode }),
    });
    if (!res.ok) {
      throw new Error("speech synthesis failed");
    }
    const blob = await res.blob();
    const src = URL.createObjectURL(blob);
    remoteSpeechCache.set(cacheKey, src);
    return src;
  })();

  remoteSpeechPending.set(cacheKey, request);
  try {
    return await request;
  } finally {
    remoteSpeechPending.delete(cacheKey);
  }
}

function hashSpeechText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return `${value.length}-${hash.toString(36)}`;
}
