import { pinyin } from "pinyin-pro";

const CHINESE_CHARACTER_RE = /[\u3400-\u9fff]/;
const INLINE_CHINESE_TERM_RE =
  /([A-Za-z0-9_+\-./]*[\u3400-\u9fff][A-Za-z0-9_+\-./\u3400-\u9fff]*)\s*[（(]([^（）()]+)[）)]/g;
const PINYIN_LIKE_RE = /^[A-Za-zÀ-ỹüÜǖǘǚǜńňḿ\s,.;:?!'-]+$/;
const JAPANESE_EXPLANATION_PREFIXES = [
  "文末助詞",
  "可能補語",
  "結果補語",
  "方向補語",
  "疑問詞",
  "否定詞",
  "方位詞",
  "接続詞",
  "形容詞",
  "副詞",
  "動詞",
  "名詞",
  "助詞",
  "量詞",
  "介詞",
  "数詞",
];
const JAPANESE_EXPLANATION_TERMS = new Set([
  "意味",
  "表現",
  "語句",
  "単語",
  "文脈",
  "場面",
  "場合",
  "場所",
  "位置",
  "方向",
  "対象",
  "範囲",
  "動作",
  "相手",
  "返答",
  "部分",
  "荷物",
  "書類",
]);

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
    return addPinyinToInlineChineseTerm(text);
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
  return value.replace(INLINE_CHINESE_TERM_RE, (match, text, inner) => {
    const trimmedText = text.trim();
    const trimmedInner = inner.trim();
    if (!PINYIN_LIKE_RE.test(trimmedInner)) return match;
    if (JAPANESE_EXPLANATION_TERMS.has(trimmedText)) return trimmedText;
    return addPinyinToInlineChineseTerm(trimmedText);
  });
}

function addPinyinToInlineChineseTerm(value: string): string {
  const { prefix, term } = splitJapaneseExplanationPrefix(value.trim());
  const reading = toMandarinPinyin(term);
  return reading ? `${prefix}${term}(${reading})` : value;
}

function splitJapaneseExplanationPrefix(value: string): { prefix: string; term: string } {
  for (const prefix of JAPANESE_EXPLANATION_PREFIXES) {
    if (!value.startsWith(prefix)) continue;
    const term = value.slice(prefix.length).trim();
    if (term && hasChineseText(term)) return { prefix, term };
  }
  return { prefix: "", term: value };
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
