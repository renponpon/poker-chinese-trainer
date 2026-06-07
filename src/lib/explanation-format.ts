import {
  addMandarinPinyinToMarkedChineseTerms,
  hasChineseText,
  toMandarinPinyin,
} from "@/lib/chinese-pinyin";

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

type StructuredExampleSection = {
  heading: string;
  examples: ExamplePair[];
};

type StructuredExplanationSection = {
  heading: string;
  bullets: string[];
  examples: ExamplePair[];
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

    const lineWithPinyin = addMandarinPinyinToMarkedChineseTerms(line);
    const translationPairLines = splitTranslationPairLine(lineWithPinyin);
    if (translationPairLines) {
      output.push(...translationPairLines);
      continue;
    }

    for (const readableLine of splitReadableLine(lineWithPinyin)) {
      output.push(readableLine);
    }
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function formatExplanationWithStructuredExamples(
  value: string,
  structuredSections: unknown,
): string {
  return formatExplanationWithStructuredSections(value, undefined, structuredSections);
}

export function formatExplanationWithStructuredSections(
  value: string,
  structuredSections: unknown,
  structuredExampleSections?: unknown,
): string {
  const explanationSections = parseStructuredExplanationSections(structuredSections);
  if (explanationSections.length > 0) {
    return formatExplanationForReading(buildStructuredExplanation(value, explanationSections));
  }

  const formatted = formatExplanationForReading(value);
  const sections = parseStructuredExampleSections(structuredExampleSections);
  if (sections.length === 0) return formatted;
  return replaceStructuredExampleSections(formatted, sections);
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
  return formatExamplePairs(extractExamplePairs(lines).slice(0, 2));
}

function formatExamplePairs(examples: ExamplePair[]): string[] {
  const output: string[] = [];
  for (const example of examples) {
    if (output.length > 0) output.push("");
    output.push(example.phrase);
    const reading = getExampleReading(example);
    if (reading) output.push(reading);
    output.push(example.translation);
  }
  return output;
}

function getExampleReading(example: ExamplePair): string | undefined {
  if (hasChineseText(example.phrase)) {
    return toMandarinPinyin(example.phrase) || undefined;
  }
  return example.reading?.trim() || undefined;
}

function extractExamplePairs(lines: string[]): ExamplePair[] {
  const contentLines = lines
    .map((line) => stripLeadingSeparator(line.trim()))
    .filter((line) => line && !isCorruptExampleLine(line));
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
  const letters = value.replace(/[^A-Za-zÀ-ỹ]/g, "");
  return hasCjk(phrase) && !hasCjk(value) && letters.length >= 2;
}

function hasCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function isCorruptExampleLine(value: string): boolean {
  const normalized = value.trim();
  if (/^[A-Za-zÀ-ỹ]{1,3}\s*[\u3400-\u9fff]/.test(normalized)) return true;
  return /^[A-Za-zÀ-ỹ]$/.test(normalized);
}

function parseStructuredExampleSections(value: unknown): StructuredExampleSection[] {
  if (!Array.isArray(value)) return [];

  const sections: StructuredExampleSection[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;

    const heading = normalizeHeadingLabel(readTextField(item, ["heading", "title", "section"]));
    if (!heading || !EXAMPLE_HEADING_LABELS.has(heading)) continue;

    const examples = parseStructuredExamples(item.examples).slice(0, 2);
    if (examples.length === 0) continue;

    sections.push({ heading, examples });
  }

  return sections;
}

function parseStructuredExplanationSections(value: unknown): StructuredExplanationSection[] {
  if (!Array.isArray(value)) return [];

  const sections: StructuredExplanationSection[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;

    const heading = normalizeHeadingLabel(readTextField(item, ["heading", "title", "section"]));
    if (!heading) continue;

    const bullets = parseStructuredBullets(item).slice(0, 2);
    const examples = parseStructuredExamples(item.examples).slice(0, 2);
    if (bullets.length === 0 && examples.length === 0) continue;

    sections.push({ heading, bullets, examples });
  }

  return sections;
}

function parseStructuredExamples(value: unknown): ExamplePair[] {
  if (!Array.isArray(value)) return [];

  const examples: ExamplePair[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;

    const phrase = cleanExamplePhrase(
      readTextField(item, ["phrase", "text", "targetText", "chinese", "sourceText"]),
    );
    const rawReading = cleanExampleTranslation(readTextField(item, ["reading", "pinyin"]));
    const translation = cleanExampleTranslation(
      readTextField(item, ["translation", "meaning", "japanese", "ja"]),
    );

    if (!phrase || !translation) continue;
    if (isCorruptExampleLine(phrase) || isCorruptExampleLine(translation)) continue;

    const reading =
      rawReading && !isCorruptExampleLine(rawReading) && isReadingForPhrase(phrase, rawReading)
        ? rawReading
        : undefined;
    examples.push({ phrase, reading, translation });
  }

  return examples;
}

function parseStructuredBullets(record: Record<string, unknown>): string[] {
  for (const key of ["bullets", "items", "points", "body", "details"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === "string")
        .map(cleanBulletText)
        .filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return value
        .split(/\r?\n/)
        .map(cleanBulletText)
        .filter(Boolean);
    }
  }

  return [];
}

function buildStructuredExplanation(
  originalValue: string,
  sections: StructuredExplanationSection[],
): string {
  const headingStyle = originalValue.includes("【") && !originalValue.includes("##")
    ? "bracket"
    : "markdown";
  const output: string[] = [];

  for (const section of sections) {
    if (output.length > 0) output.push("");
    output.push(formatHeading(section.heading, headingStyle));

    if (section.examples.length > 0) {
      output.push(...formatExamplePairs(section.examples));
      continue;
    }

    for (const bullet of section.bullets) {
      output.push(`- ${bullet}`);
    }
  }

  return output.join("\n").trim();
}

function formatHeading(heading: string, style: "bracket" | "markdown"): string {
  return style === "bracket" ? `【${heading}】` : `## ${heading}`;
}

function replaceStructuredExampleSections(
  formatted: string,
  sections: StructuredExampleSection[],
): string {
  const sectionByHeading = new Map(sections.map((section) => [section.heading, section]));
  const output: string[] = [];
  const lines = formatted.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = isHeading(line) ? normalizeHeadingLabel(line) : "";
    const section = heading ? sectionByHeading.get(heading) : undefined;

    if (!section) {
      output.push(line);
      continue;
    }

    output.push(line);
    output.push(...formatExamplePairs(section.examples));
    while (index + 1 < lines.length && !isHeading(lines[index + 1])) {
      index += 1;
    }
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function readTextField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function cleanBulletText(value: string): string {
  return addMandarinPinyinToMarkedChineseTerms(stripLeadingSeparator(value.trim())
    .replace(/^[-・]\s*/, "")
    .trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function splitReadableLine(line: string): string[] {
  const bulletMatch = line.match(/^([-・]\s*)(.+)$/);
  const prefix = bulletMatch?.[1] ?? "";
  const body = bulletMatch?.[2] ?? line;

  if (body.includes("「") && body.includes("」")) return [line];
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
  const trimmed = value.trim();
  const parenthetical = trimmed.match(/^[（(]\s*(.+?)\s*[）)]$/);
  return parenthetical ? parenthetical[1].trim() : trimmed;
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
