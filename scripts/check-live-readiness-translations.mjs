import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const origin = "https://phrabit.com";
const outputDirectory = "tmp/phrabit-responsive-shots/readiness-20260907";
const cases = [
  { text: "明日の朝、ここで私を待っていてください。", language: "zh", mode: "quality" },
  { text: "彼に渡すのではなく、私に返してください。", language: "zh", mode: "normal" },
  { text: "前にもここで買ったことがあります。", language: "zh", mode: "speed" },
  { text: "毎週ではなく、隔週でお願いします。", language: "zh", mode: "quality" },
  { text: "全部で二つです。二人に一つずつではありません。", language: "zh", mode: "normal" },
  { text: "まだ決めていません。明日までに返事します。", language: "en", mode: "normal" },
  { text: "鍵を部屋の中に置いたまま、ドアを閉めてしまいました。", language: "en", mode: "speed" },
  { text: "窓側の席が空いたら、移ってもいいですか？", language: "en", mode: "quality" },
  { text: "今月分はもう払いました。確認していただけますか？", language: "en", mode: "quality" },
  { text: "それは私の荷物ではなく、友達のです。", language: "zh", mode: "quality" },
];

await mkdir(outputDirectory, { recursive: true });
const results = [];
async function post(path, payload) {
  const started = performance.now();
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}: ${data.error ?? "Unknown error"}`);
  return { data, elapsedMs: Math.round(performance.now() - started) };
}

for (const entry of cases) {
  const phraseId = crypto.randomUUID();
  const direction = `ja-to-${entry.language}`;
  const translation = await post("/api/phrase/add", {
    phraseId, text: entry.text, direction, generationMode: entry.mode, persist: false, shouldDrill: false,
  });
  const result = { ...entry, phraseId, response: translation.data, translationMs: translation.elapsedMs, explanationMs: 0 };
  if (!result.response.explanation?.trim()) {
    const explanation = await post("/api/phrase/explain", {
      phraseId, direction, sourceText: entry.text, targetText: result.response.targetText,
      japanese: entry.text, chinese: entry.language === "zh" ? result.response.targetText : "",
    });
    result.response.explanation = explanation.data.explanation;
    if (explanation.data.pinyin) result.response.pinyin = explanation.data.pinyin;
    result.explanationMs = explanation.elapsedMs;
  }
  results.push(result);
  await writeFile(`${outputDirectory}/translations.json`, JSON.stringify(results, null, 2), "utf8");
  const report = results.map((item, index) => [
    `${index + 1}. ${item.language} / ${item.mode} / ${item.response.provider}`,
    `入力: ${item.text}`, `訳: ${item.response.targetText}`, `ピンイン: ${item.response.pinyin ?? item.response.reading ?? ""}`,
    `翻訳: ${item.translationMs}ms / 後続解説: ${item.explanationMs}ms`, item.response.explanation,
  ].join("\n")).join("\n\n====================\n\n");
  await writeFile(`${outputDirectory}/translations.txt`, report, "utf8");
  console.log(`${results.length}/${cases.length} ${entry.language}/${entry.mode}: ${result.translationMs}ms + ${result.explanationMs}ms`);
}
console.log(`Report: ${outputDirectory}/translations.txt (no auth token, no save-pack request; AI usage records may include these tests)`);
