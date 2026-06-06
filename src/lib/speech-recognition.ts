const HIGH_ACCURACY_SPEECH_UNTIL_KEY = "chineseStudy.highAccuracySpeechUntil";
const HIGH_ACCURACY_SPEECH_TTL_MS = 30 * 60 * 1000;

export function getSpeechRecognitionSupportError(): string | null {
  if (typeof window === "undefined") return "音声入力はブラウザでのみ使えます。";

  if (!window.isSecureContext) {
    return "音声入力はHTTPSのページでのみ使えます。手入力で進めてください。";
  }

  if (isLikelyInAppBrowser()) {
    return "Discord/LINEなどのアプリ内ブラウザでは音声入力が許可されないことがあります。Safari/Chromeで開くか、手入力・キーボードのマイクを使ってください。";
  }

  const recognition =
    window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!recognition) {
    return "このブラウザは音声入力に未対応です。手入力、またはスマホ標準キーボードのマイクを使ってください。";
  }

  return null;
}

export function getSpeechRecognitionErrorMessage(error: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "音声入力が許可されませんでした。ブラウザのマイク許可を確認するか、手入力・キーボードのマイクを使ってください。中国本土や会社Wi-Fiでは音声認識が使えないことがあります。";
    case "audio-capture":
      return "マイクを取得できませんでした。端末のマイク設定を確認するか、手入力で進めてください。";
    case "network":
      return "音声認識サービスに接続できませんでした。中国本土や会社Wi-Fiでは失敗することがあります。手入力で進めてください。";
    case "no-speech":
      return "音声を聞き取れませんでした。もう一度試すか、手入力で進めてください。";
    default:
      return `音声入力エラー: ${error}。手入力、またはスマホ標準キーボードのマイクを使ってください。`;
  }
}

export function shouldSwitchToHighAccuracySpeech(error: string): boolean {
  return error === "network" || error === "service-not-allowed";
}

export function isMicrophoneAccessError(error: string): boolean {
  return error === "audio-capture" || error === "not-allowed";
}

export function rememberHighAccuracySpeechPreference() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    HIGH_ACCURACY_SPEECH_UNTIL_KEY,
    String(Date.now() + HIGH_ACCURACY_SPEECH_TTL_MS),
  );
}

export function shouldUseHighAccuracySpeechFirst(): boolean {
  if (typeof window === "undefined") return false;
  const until = Number.parseInt(
    window.sessionStorage.getItem(HIGH_ACCURACY_SPEECH_UNTIL_KEY) ?? "",
    10,
  );
  if (!Number.isFinite(until) || until <= Date.now()) {
    window.sessionStorage.removeItem(HIGH_ACCURACY_SPEECH_UNTIL_KEY);
    return false;
  }
  return true;
}

function isLikelyInAppBrowser(): boolean {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return [
    "discord",
    "line/",
    "fbav",
    "fban",
    "instagram",
    "micromessenger",
  ].some((keyword) => userAgent.includes(keyword));
}
