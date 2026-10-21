import { pinyin } from "pinyin-pro";
import type { PhraseDirection } from "./types";

export type ExplanationPinyinOptions = {
  direction?: PhraseDirection;
  japaneseText?: string;
  chineseText?: string;
  markedOnly?: boolean;
};

const CHINESE_CHARACTER_RE = /[\u3400-\u9fff]/;
const INLINE_CHINESE_TERM_RE =
  /([A-Za-z0-9_+＋\-/／]*[\u3400-\u9fff][A-Za-z0-9_+＋\-/／\u3400-\u9fff]*)([.…]*)\s*[（(]([^（）()]+)[）)]/g;
const PINYIN_LIKE_RE = /^[A-Za-zÀ-ỹüÜǖǘǚǜńňḿ0-9\s,.;:?!'…，。！？；：+＋/／-]+$/;
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
  "例",
  "完成例",
  "置換例",
  "日本語訳",
]);

export function hasChineseText(value: string): boolean {
  return CHINESE_CHARACTER_RE.test(value);
}

export function toMandarinPinyin(value: string, context?: string): string {
  if (!hasChineseText(value)) return "";

  if (context && context !== value && /[只得]/.test(value) && context.includes(value)) {
    const readings = new Set<string>();
    const syllables = mandarinSyllables(context);
    for (let matchIndex = context.indexOf(value); matchIndex !== -1; matchIndex = context.indexOf(value, matchIndex + 1)) {
      let sourceOffset = 0;
      const matched = syllables.filter((syllable) => {
        const start = sourceOffset;
        sourceOffset += syllable.origin.length;
        return start >= matchIndex && sourceOffset <= matchIndex + value.length;
      });
      if (matched.map((syllable) => syllable.origin).join("") === value) {
        readings.add(normalizePinyinText(matched.map((syllable) => syllable.result).join(" ")));
      }
    }
    if (readings.size === 1) return [...readings][0];
  }

  return normalizePinyinText(mandarinSyllables(value).map((syllable) => syllable.result).join(" "));
}

function mandarinSyllables(value: string) {
  const readingOverrides = new Map<number, string>();
  if (value.trim() === "还给") readingOverrides.set(value.indexOf("还"), "huán");
  for (const match of value.matchAll(
    /(?:^\s*|(?:^|[，。！？；,.!?;]\s*)(?:请(?:你|您)?(?:直接)?|(?:那)?我(?:现在|马上|已经)|(?:那)?(?:我们?)?(?:这就|现在|马上|立刻|立即)|这个请(?:直接)?))还(?:给)?[我你您他她它]们?(?:了)?(?:吧|吗)?(?=\s*(?:$|[，。！？；,.!?;]))/g,
  )) {
    readingOverrides.set(match.index + match[0].indexOf("还"), "huán");
  }
  for (const match of value.matchAll(
    /(?:请(?:你|您)?)?[把将][^，。！？；,.!?;]{1,24}?还给(?:了)?[我你您他她它]们?(?:了)?/g,
  )) {
    readingOverrides.set(match.index + match[0].indexOf("还给"), "huán");
  }

  for (const match of value.matchAll(/袋子|说得(?:再|很)?(?:慢|快|清楚)/g)) {
    readingOverrides.set(match.index + 1, match[0] === "袋子" ? "zi" : "de");
  }

  for (const match of value.matchAll(/(?:^\s*|[，。！？；,.!?;]\s*|[我你您他她它]们?|(?:而)?(?:不)?是)只(?=住|需要|想)/g)) {
    readingOverrides.set(match.index + match[0].lastIndexOf("只"), "zhǐ");
  }

  for (const match of value.matchAll(/(?:^\s*|[，。！？；,.!?;]\s*|[我你您他她它]们?|只是|还是)(?:还|也|都|总)?得(?=先(?!后|後))/g)) {
    readingOverrides.set(match.index + match[0].lastIndexOf("得"), "děi");
  }

  let sourceOffset = 0;
  return pinyin(value, {
    type: "all",
    toneType: "symbol",
    toneSandhi: false,
    nonZh: "consecutive",
  }).map((syllable) => {
    const result = readingOverrides.get(sourceOffset) ?? syllable.result;
    sourceOffset += syllable.origin.length;
    return { ...syllable, result };
  });
}

export function addMandarinPinyinToMarkedChineseTerms(value: string, options: ExplanationPinyinOptions = {}): string {
  if (!allowsMandarin(options)) {
    return normalizeExistingInlinePinyin(value.replace(/{{\s*([^{}]+?)\s*}}/g, "$1"), options);
  }
  const normalized = markKnownChineseTerms(normalizeExistingInlinePinyin(collapseRepeatedInlinePinyin(value), options), options).replace(
    /{{\s*([^{}]+?)\s*}}(\s*[（(]([^（）()]+)[）)])?/g,
    (_match, term: string, annotation: string | undefined, reading: string | undefined) => {
      const text = term.trim();
      const suffix = reading && isInlinePinyinReading(reading, text) ? "" : annotation ?? "";
      return `${addPinyinToInlineChineseTerm(text, options)}${suffix}`;
    },
  );
  return normalizeReturnDecompositionPinyin(normalized);
}

export function completeMandarinPinyinForTemplateBullet(value: string, options: ExplanationPinyinOptions = {}): string {
  const normalized = addMandarinPinyinToMarkedChineseTerms(value, options);
  if (options.markedOnly || !allowsMandarin(options)) return normalized;
  return splitOutsideParentheses(normalized)
    .map((part) => {
      if (!hasChineseText(part)) return part;
      if (/[ぁ-ゖァ-ヺー]/.test(part)) return part;
      const label = part.match(/^(\s*[\u3400-\u9fff]+[：:]\s*)(.*)$/);
      return label ? `${label[1]}${addPinyinToInlineChineseTerm(label[2], options)}` : addPinyinToInlineChineseTerm(part, options);
    })
    .join("");
}

function splitOutsideParentheses(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (/[（(]/.test(character)) depth += 1;
    else if (/[）)]/.test(character)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && /[，、；。！？,;!?]/.test(character)) {
      parts.push(value.slice(start, index), character);
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

export function overwriteStructuredSectionPinyin(value: unknown, options: ExplanationPinyinOptions = {}): unknown {
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
        if (!allowsMandarin(options) || /[ぁ-ゖァ-ヺー]/.test(phrase)) return { ...example, reading: "", pinyin: "" };
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

function normalizeExistingInlinePinyin(value: string, options: ExplanationPinyinOptions): string {
  return value.replace(INLINE_CHINESE_TERM_RE, (match, text, ellipsis, inner) => {
    const trimmedText = text.trim();
    const trimmedInner = inner.trim();
    if (!isInlinePinyinReading(trimmedInner, trimmedText)) return match;
    if (!allowsMandarin(options)) {
      return normalizePinyinLetters(trimmedInner) === normalizePinyinLetters(toMandarinPinyin(trimmedText))
        ? `${trimmedText}${ellipsis}` : match;
    }
    return `${addPinyinToInlineChineseTerm(trimmedText, options)}${ellipsis}`;
  });
}

function allowsMandarin(options: ExplanationPinyinOptions): boolean {
  return !options.direction || options.direction.split("-to-").includes("zh");
}

function markKnownChineseTerms(value: string, options: ExplanationPinyinOptions): string {
  if (!options.chineseText) return value;
  return value.replace(/{{[^{}]*}}|[（(][^（）()]*[）)]|([A-Za-z0-9_+＋\-/／]*[\u3400-\u9fff][A-Za-z0-9_+＋\-/／\u3400-\u9fff]*)(\s*[（(][^（）()]*[）)])?/g,
    (match, term: string | undefined, annotation: string | undefined) => {
      if (!term || annotation || term.length < 2 || !options.chineseText!.includes(term)
        || options.japaneseText?.includes(term) || isJapaneseExplanationText(term, options)) return match;
      return `{{${term}}}`;
    });
}

function isInlinePinyinReading(value: string, term: string): boolean {
  if (!PINYIN_LIKE_RE.test(value) || !/[A-Za-zÀ-ỹ]/.test(value)) return false;
  if (/[À-ỹüÜǖǘǚǜńňḿ]/.test(value)) return true;
  return normalizePinyinLetters(value) === normalizePinyinLetters(toMandarinPinyin(term));
}

function normalizePinyinLetters(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/gi, "").toLowerCase();
}

function collapseRepeatedInlinePinyin(value: string): string {
  const readingPattern = /[（(]([^（）()]+)[）)]/g;
  const parts: string[] = [];
  let start = 0;
  for (const match of value.matchAll(readingPattern)) {
    if (match.index < start || !isInlinePinyinReading(match[1], "")) continue;
    const reading = normalizePinyinLetters(match[1]);
    let end = match.index + match[0].length;
    while (end < value.length) {
      const opening = end + (value.slice(end).match(/^\s*/)?.[0].length ?? 0);
      if (!/[（(]/.test(value[opening] ?? "")) break;
      let depth = 1;
      let closing = opening + 1;
      for (; closing < value.length && depth > 0; closing += 1) {
        if (/[（(]/.test(value[closing])) depth += 1;
        else if (/[）)]/.test(value[closing])) depth -= 1;
      }
      if (depth !== 0) break;
      const inner = value.slice(opening + 1, closing - 1).replace(/[（）()]/g, "");
      const repeated = normalizePinyinLetters(inner);
      if (!PINYIN_LIKE_RE.test(inner) || !repeated || repeated.length % reading.length !== 0
        || reading.repeat(repeated.length / reading.length) !== repeated) break;
      end = closing;
    }
    if (end === match.index + match[0].length) continue;
    parts.push(value.slice(start, match.index), match[0]);
    start = end;
  }
  parts.push(value.slice(start));
  return parts.join("");
}

function normalizeReturnDecompositionPinyin(value: string): string {
  if (!/还给[^（(\n]*[（(]huán gěi\b/.test(value)) return value;
  return value.replace(
    /还[（(]hái[）)](?=\s*(?:と|[+＋])\s*给(?:[我你您他她它]们?)?\s*[（(])/g,
    "还(huán)",
  );
}

function addPinyinToInlineChineseTerm(value: string, options: ExplanationPinyinOptions): string {
  if (/[ぁ-ゖァ-ヺー]/.test(value)) return value;
  return value.replace(
    /([A-Za-z0-9_\-/]*[\u3400-\u9fff][A-Za-z0-9_\-/\u3400-\u9fff]*)([.…]*)(\s*[（(]([^（）()]+)[）)])?|[（(][^（）()]*[）)]/g,
    (match, text: string | undefined, ellipsis: string, annotation: string | undefined, oldReading: string | undefined) => {
      if (!text) return match;
      const { prefix, term } = splitJapaneseExplanationPrefix(text);
      const suffix = oldReading && isInlinePinyinReading(oldReading, text) ? "" : annotation ?? "";
      if (isJapaneseExplanationText(term, options)) return `${prefix}${term}${ellipsis}${suffix}`;
      const reading = toMandarinPinyin(term, options.chineseText);
      return `${prefix}${term}${reading ? `(${reading})` : ""}${ellipsis}${suffix}`;
    },
  );
}

function isJapaneseExplanationText(value: string, options: ExplanationPinyinOptions): boolean {
  return /[ぁ-ゖァ-ヺー]/.test(value)
    || (!!options.japaneseText?.includes(value) && !!options.chineseText && !options.chineseText.includes(value))
    || JAPANESE_EXPLANATION_TERMS.has(value)
    || JAPANESE_EXPLANATION_PREFIXES.includes(value)
    || (value === "一部" && !options.chineseText?.includes(value))
    || /^[一二三四五六七八九十百千万\d]+泊(?:[一二三四五六七八九十百千万\d]+日)?$/.test(value);
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
