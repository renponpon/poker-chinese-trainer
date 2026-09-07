import assert from "node:assert/strict";
import test from "node:test";
import {
  addMandarinPinyinToMarkedChineseTerms,
  overwriteStructuredSectionPinyin,
  toMandarinPinyin,
} from "./chinese-pinyin";

for (const phrase of [
  "还给",
  "还给我",
  "不要交给他，请还给我。",
  "好的，那我现在还给你。",
  "这个请直接还给我。",
  "请您还给我们吧。",
  "我已经还给他了。",
  "把那个还给我，请说慢一点。",
  "请把收据还给我。",
  "他把钱还给我了。",
  "请将钥匙还给他。",
  "我把书还给了他们。",
  "OK，请还给我。",
  "🙂，请还给我。",
]) {
  test(`return expression uses huán: ${phrase}`, () => {
    assert.match(toMandarinPinyin(phrase), /huán gěi/);
    assert.doesNotMatch(toMandarinPinyin(phrase), /hái gěi/);
  });
}

for (const phrase of [
  "他还给我买了礼物。",
  "请还给我买一本书。",
  "还给他买了一份。",
  "还给我买书",
  "他还给了我一本书。",
  "他不但给了你，还给我。",
  "我还没吃饭。",
]) {
  test(`additive or still meaning is not rewritten: ${phrase}`, () => {
    assert.match(toMandarinPinyin(phrase), /hái/);
    assert.doesNotMatch(toMandarinPinyin(phrase), /huán/);
  });
}

test("mixed return and additive clauses keep their distinct readings", () => {
  assert.equal(
    toMandarinPinyin("请还给我，他还给我买了书。"),
    "qǐng huán gěi wǒ, tā hái gěi wǒ mǎi le shū.",
  );
});

test("inline terms use the same correction without absorbing Japanese prefixes", () => {
  assert.equal(addMandarinPinyinToMarkedChineseTerms("動詞还给(hái gěi) と {{还给}}"),
    "動詞还给(huán gěi) と 还给(huán gěi)");
});

test("structured examples preserve fields and replace both readings", () => {
  assert.deepEqual(overwriteStructuredSectionPinyin([
    { heading: "返答", examples: [{ phrase: "我现在还给你。", translation: "今返します。", reading: "wrong", pinyin: "wrong" }] },
  ]), [
    { heading: "返答", examples: [{ phrase: "我现在还给你。", translation: "今返します。", reading: "wǒ xiàn zài huán gěi nǐ.", pinyin: "wǒ xiàn zài huán gěi nǐ." }] },
  ]);
});

test("ordinary Chinese, punctuation and non-Chinese behavior stays unchanged", () => {
  assert.equal(toMandarinPinyin("你好，世界！"), "nǐ hǎo, shì jiè!");
  assert.equal(toMandarinPinyin("Hello!"), "");
  assert.equal(toMandarinPinyin(""), "");
});

test("bag suffix and the observed speaking complement use neutral tone", () => {
  assert.equal(toMandarinPinyin("不需要袋子。"), "bù xū yào dài zi.");
  assert.equal(toMandarinPinyin("请说得再慢一点。"), "qǐng shuō de zài màn yī diǎn.");
  assert.equal(toMandarinPinyin("说得很慢"), "shuō de hěn màn");
  assert.equal(toMandarinPinyin("他得到了礼物。"), "tā dé dào le lǐ wù.");
});
