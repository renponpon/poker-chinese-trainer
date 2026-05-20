let cachedZhVoice: SpeechSynthesisVoice | null = null;
let cachedJaVoice: SpeechSynthesisVoice | null = null;

function pickZhVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  if (cachedZhVoice) return cachedZhVoice;
  const voices = window.speechSynthesis.getVoices();
  const zh = voices.find(
    (v) =>
      v.lang.toLowerCase().startsWith("zh") ||
      v.lang.toLowerCase().startsWith("cmn"),
  );
  if (zh) cachedZhVoice = zh;
  return zh ?? null;
}

function pickJaVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  if (cachedJaVoice) return cachedJaVoice;
  const voices = window.speechSynthesis.getVoices();
  const ja = voices.find((v) => v.lang.toLowerCase().startsWith("ja"));
  if (ja) cachedJaVoice = ja;
  return ja ?? null;
}

export function primeSpeech(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.getVoices();
}

export function playChinese(text: string, opts: { rate?: number } = {}): void {
  if (typeof window === "undefined") return;
  if (!text) return;
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickZhVoice();
  if (voice) utter.voice = voice;
  utter.lang = "zh-CN";
  utter.rate = opts.rate ?? 0.9;
  utter.pitch = 1.0;
  window.speechSynthesis.speak(utter);
}

export function playJapanese(text: string, opts: { rate?: number } = {}): void {
  if (typeof window === "undefined") return;
  if (!text) return;
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickJaVoice();
  if (voice) utter.voice = voice;
  utter.lang = "ja-JP";
  utter.rate = opts.rate ?? 0.95;
  utter.pitch = 1.0;
  window.speechSynthesis.speak(utter);
}
