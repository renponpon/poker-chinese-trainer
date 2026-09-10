export class RequestStoppedError extends Error {
  readonly status = 504;
  readonly retryable = false;
  constructor(public readonly code: "request_cancelled" | "request_timeout") {
    super(code === "request_timeout"
      ? "通信に時間がかかっています。入力を残しました。もう一度送信できます。"
      : "待機を中止しました。入力を残しました。サーバー側の処理・料金が取り消されるとは限りません。");
    this.name = "RequestStoppedError";
  }
}

export function createTimedRequest(timeoutMs = 45_000) {
  const controller = new AbortController();
  return {
    cancel: () => controller.abort(new RequestStoppedError("request_cancelled")),
    async run<Result>(task: (signal: AbortSignal) => Promise<Result>): Promise<Result> {
      controller.signal.throwIfAborted();
      let onAbort: () => void = () => {};
      const cancelled = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });
      const timeout = setTimeout(() => controller.abort(new RequestStoppedError("request_timeout")), timeoutMs);
      try {
        return await Promise.race([task(controller.signal), cancelled]);
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", onAbort);
      }
    },
  };
}

export async function fetchJsonWithDeadline<Result>(url: string, init?: RequestInit): Promise<Result> {
  return createTimedRequest().run(async (signal) => {
    const response = await fetch(url, { ...init, signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "通信に失敗しました");
    return data as Result;
  });
}
