const MAX_LINE_CHARS = 58;
const EXAMPLE_HEADING_LABELS = new Set([
  "他の自然な言い方",
  "相手の想定返答",
  "想定される相手の返答",
  "返答するときの例",
  "類似・関連フレーズ",
]);
const HIDDEN_HEADING_LABELS = new Set(["発音のコツ", "発音のコツ・注意点"]);

type ExamplePair = {
  phrase: string;
  reading?: string;
  translation: string;
};

export function formatExplanationForReading(value: string): string {
  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n+([)）\]】」』])/g, "$1")
    .replace(/([^\n])(\s*【[^】]+】)/g, "$1\n\n$2")
    .replace(/(【[^】]+】)[ \t]*/g, "$1\n")
    .replace(/([^\n])(\s*##\s*[^\n]+)/g, "$1\n\n$2")
    .replace(/(##\s*[^\n]+)[ \t]*/g, "$1\n")
    .trim();

  const output: string[] = [];
  const lines = normalized.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = stripLeadingSeparator(rawLine.trim());
    if (!line) {
      pushBlank(output);
      continue;
    }

    if (isHeading(line)) {
      if (isHiddenHeading(line)) {
        while (index + 1 < lines.length) {
          const nextLine = stripLeadingSeparator(lines[index + 1].trim());
          if (isHeading(nextLine)) break;
          index += 1;
        }
        continue;
      }
      if (output.length > 0) pushBlank(output);
      output.push(line);
      if (isExampleHeading(line)) {
        const bodyLines: string[] = [];
        while (index + 1 < lines.length) {
          const nextLine = stripLeadingSeparator(lines[index + 1].trim());
          if (isHeading(nextLine)) break;
          bodyLines.push(lines[index + 1]);
          index += 1;
        }
        output.push(...formatExampleSectionLines(bodyLines));
      }
      continue;
    }

    const translationPairLines = splitTranslationPairLine(line);
    if (translationPairLines) {
      output.push(...translationPairLines);
      continue;
    }

    for (const readableLine of splitReadableLine(line)) {
      output.push(readableLine);
    }
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isHeading(line: string): boolean {
  return /^【[^】]+】$/.test(line) || /^#{2,3}\s+\S/.test(line);
}

function isExampleHeading(line: string): boolean {
  return EXAMPLE_HEADING_LABELS.has(normalizeHeadingLabel(line));
}

function isHiddenHeading(line: string): boolean {
  return HIDDEN_HEADING_LABELS.has(normalizeHeadingLabel(line));
}

function normalizeHeadingLabel(line: string): string {
  return line
    .replace(/^#{2,3}\s*/, "")
    .replace(/^【/, "")
    .replace(/】$/, "")
    .trim();
}

function formatExampleSectionLines(lines: string[]): string[] {
  const examples = extractExamplePairs(lines).slice(0, 2);
  const output: string[] = [];
  for (const example of examples) {
    if (output.length > 0) output.push("");
    output.push(example.phrase);
    if (example.reading) output.push(example.reading);
    output.push(example.translation);
  }
  return output;
}

function extractExamplePairs(lines: string[]): ExamplePair[] {
  const contentLines = lines.map((line) => stripLeadingSeparator(line.trim())).filter(Boolean);
  const pairs: ExamplePair[] = [];

  for (let index = 0; index < contentLines.length && pairs.length < 2; ) {
    const current = cleanExamplePhrase(contentLines[index]);
    const parenthetical = splitTrailingParenthetical(current);

    if (parenthetical) {
      const phrase = cleanExamplePhrase(parenthetical.phrase);
      const inner = cleanExampleTranslation(parenthetical.inner);
      const nextLine = contentLines[index + 1]
        ? cleanExampleTranslation(contentLines[index + 1])
        : "";

      if (isReadingForPhrase(phrase, inner) && nextLine) {
        pairs.push({ phrase, reading: inner, translation: nextLine });
        index += 2;
        continue;
      }

      if (phrase && inner) {
        pairs.push({ phrase, translation: inner });
        index += 1;
        continue;
      }
    }

    const phrase = current;
    const nextLine = contentLines[index + 1]
      ? cleanExampleTranslation(contentLines[index + 1])
      : "";
    const thirdLine = contentLines[index + 2]
      ? cleanExampleTranslation(contentLines[index + 2])
      : "";

    if (phrase && nextLine && thirdLine && isReadingForPhrase(phrase, nextLine)) {
      pairs.push({ phrase, reading: nextLine, translation: thirdLine });
      index += 3;
      continue;
    }

    if (phrase && nextLine) {
      pairs.push({ phrase, translation: nextLine });
      index += 2;
      continue;
    }

    index += 1;
  }

  return pairs;
}

function splitTrailingParenthetical(value: string): { phrase: string; inner: string } | null {
  const match = value.match(/^(.+?)\s*[（(]([^（）()]+)[）)](?:\s*(?:など。?)?)?$/);
  if (!match) return null;
  return { phrase: match[1], inner: match[2] };
}

function isReadingForPhrase(phrase: string, value: string): boolean {
  return hasCjk(phrase) && !hasCjk(value) && /[A-Za-zÀ-ỹ]/.test(value);
}

function hasCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function splitReadableLine(line: string): string[] {
  const bulletMatch = line.match(/^([-・]\s*)(.+)$/);
  const prefix = bulletMatch?.[1] ?? "";
  const body = bulletMatch?.[2] ?? line;

  if (body.length <= MAX_LINE_CHARS) return [line];

  const sentences = body
    .match(/[^。！？]+(?:[。！？]+[)）\]】」』]*)?/g)
    ?.map((sentence) => stripLeadingSeparator(sentence.trim()))
    .filter(Boolean);

  if (!sentences || sentences.length <= 1) return [line];
  return sentences.map((sentence) => `${prefix}${sentence}`);
}

function splitTranslationPairLine(line: string): string[] | null {
  const match = line.match(/^([A-Za-z0-9][^（]+?[.!?])\s*（([^）]+)）(\s*など。?)?$/);
  if (!match) return null;

  const phrase = match[1].trim();
  const translation = match[2].trim();
  const suffix = match[3]?.trim() ?? "";
  return [phrase, `（${translation}）${suffix}`];
}

function cleanExamplePhrase(value: string): string {
  return stripLeadingSeparator(value)
    .replace(/^[-・]\s*/, "")
    .replace(/^(や|または|また|or|and)\s+/i, "")
    .replace(/\s*(など|も非常に一般的です。?)$/, "")
    .trim();
}

function cleanExampleTranslation(value: string): string {
  return value
    .replace(/^[（(]\s*/, "")
    .replace(/\s*[）)]$/, "")
    .trim();
}

function stripLeadingSeparator(value: string): string {
  return value.replace(/^[、,]\s*/, "");
}

function pushBlank(output: string[]): void {
  if (output.length === 0) return;
  if (output[output.length - 1] === "") return;
  if (isHeading(output[output.length - 1])) return;
  output.push("");
}
