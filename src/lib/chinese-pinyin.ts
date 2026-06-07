import { pinyin } from "pinyin-pro";

const CHINESE_CHARACTER_RE = /[\u3400-\u9fff]/;
const PINYIN_LIKE_RE = /^[A-Za-zÀ-ỹüÜǖǘǚǜńňḿ\s,.;:?!'-]+$/;

export function hasChineseText(value: string): boolean {
  return CHINESE_CHARACTER_RE.test(value);
}

export function toMandarinPinyin(value: string): string {
  if (!hasChineseText(value)) return "";

  const converted = pinyin(value, {
    toneType: "symbol",
    toneSandhi: false,
    nonZh: "consecutive",
  });

  return normalizePinyinText(converted);
}

export function addMandarinPinyinToMarkedChineseTerms(value: string): string {
  return normalizeExistingInlinePinyin(value).replace(/{{\s*([^{}]+?)\s*}}/g, (_match, term) => {
    const text = term.trim();
    if (!hasChineseText(text)) return text;
    const reading = toMandarinPinyin(text);
    return reading ? `${text}(${reading})` : text;
  });
}

export function overwriteStructuredSectionPinyin(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  return value.map((section) => {
    if (!isRecord(section)) return section;
    const examples = section.examples;
    if (!Array.isArray(examples)) return section;

    return {
      ...section,
      examples: examples.map((example) => {
        if (!isRecord(example)) return example;
        const phrase = readTextField(example, ["phrase", "text", "targetText", "chinese", "sourceText"]);
        if (!hasChineseText(phrase)) return example;
        const reading = toMandarinPinyin(phrase);
        return {
          ...example,
          reading,
          pinyin: reading,
        };
      }),
    };
  });
}

function normalizePinyinText(value: string): string {
  return value
    .replace(/，/g, ",")
    .replace(/、/g, ",")
    .replace(/。/g, ".")
    .replace(/？/g, "?")
    .replace(/！/g, "!")
    .replace(/；/g, ";")
    .replace(/：/g, ":")
    .replace(/\s+([,.;:?!])/g, "$1")
    .replace(/([,.;:?!])(?=\S)/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeExistingInlinePinyin(value: string): string {
  return value.replace(/([\u3400-\u9fff]+)\s*[（(]([^（）()]+)[）)]/g, (match, text, inner) => {
    const trimmedInner = inner.trim();
    if (!PINYIN_LIKE_RE.test(trimmedInner)) return match;
    const reading = toMandarinPinyin(text);
    return reading ? `${text}(${reading})` : text;
  });
}

function readTextField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
