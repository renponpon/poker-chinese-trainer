let voicesListenerAttached = false;
let activeSession: SpeechPlayOptions | null = null;

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

function scoreZhVoice(voice: SpeechSynthesisVoice): number {
  const lang = normalizeLang(voice.lang);
  let score = 0;
  if (lang === "zh-cn" || lang.startsWith("zh-cn")) score += 100;
  else if (lang.startsWith("zh") || lang.startsWith("cmn")) score += 40;
  if (voice.localService) score += 30;
  return score;
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
  activeSession?.onEnd?.();
  activeSession = null;
}

function speakNow(utter: SpeechSynthesisUtterance): void {
  const synth = window.speechSynthesis;
  synth.cancel();
  synth.resume();
  getVoices();
  synth.speak(utter);
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
    opts.onEnd?.();
  };
  utter.onerror = (event) => {
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

    speakNow(utter);
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
  speakNow(utter);

  function finish() {
    if (activeSession === opts) {
      activeSession = null;
    }
    opts.onEnd?.();
  }
}
