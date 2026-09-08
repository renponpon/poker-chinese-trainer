import assert from "node:assert/strict";
import test from "node:test";
import {
  addMandarinPinyinToMarkedChineseTerms,
  completeMandarinPinyinForTemplateBullet,
  overwriteStructuredSectionPinyin,
  toMandarinPinyin,
} from "./chinese-pinyin";

for (const phrase of [
  "还给",
  "还给我",
  "不要交给他，请还给我。",
  "好的，那我现在还给你。",
  "好的，这就还给您。",
  "好了，现在还给你。",
  "这就还给您",
  "我这就还给你。",
  "好的，我们马上还给他们。",
  "那我立刻还给您。",
  "立即还给我！",
  "OK，\n 这就还给您。",
  "🙂，马上还给你。",
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
  "这就还给您买一本书。",
  "我马上还给你买书。",
  "还给您带了礼物。",
  "现在还给您买一本书。",
  "现在还您一个人去吗？",
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
  assert.equal(
    toMandarinPinyin("好的，这就还给您。他还给我买了书。"),
    "hǎo de, zhè jiù huán gěi nín. tā hái gěi wǒ mǎi le shū.",
  );
});

test("return recipient can omit 给 at a clause boundary", () => {
  assert.equal(toMandarinPinyin("知道了，马上还您。"), "zhī dào le, mǎ shàng huán nín.");
  assert.equal(toMandarinPinyin("请还我。"), "qǐng huán wǒ.");
  assert.equal(toMandarinPinyin("我这就还你。"), "wǒ zhè jiù huán nǐ.");
});

test("inline terms use the same correction without absorbing Japanese prefixes", () => {
  assert.equal(addMandarinPinyinToMarkedChineseTerms("動詞还给(hái gěi) と {{还给}}"),
    "動詞还给(huán gěi) と 还给(huán gěi)");
});

test("return decomposition uses huán while preserving true additive contrasts", () => {
  assert.equal(
    addMandarinPinyinToMarkedChineseTerms(
      "还给我(huán gěi wǒ)は还(hái)と给我(gěi wǒ)が組み合わさった表現です。",
    ),
    "还给我(huán gěi wǒ)は还(huán)と给我(gěi wǒ)が組み合わさった表現です。",
  );
  assert.equal(
    addMandarinPinyinToMarkedChineseTerms(
      "还(hái)は『さらに』、还给(huán gěi)は『返す』を表します。",
    ),
    "还(hái)は『さらに』、还给(huán gěi)は『返す』を表します。",
  );
});

test("template bullets fill missing clause readings without touching Japanese prose", () => {
  assert.equal(
    completeMandarinPinyinForTemplateBullet(
      "把它交给我(bǎ tā jiāo gěi wǒ)、请再说慢一点。",
    ),
    "把它交给我(bǎ tā jiāo gěi wǒ)、请再说慢一点(qǐng zài shuō màn yī diǎn)。",
  );
  assert.equal(
    completeMandarinPinyinForTemplateBullet(
      "把它还给我、请再大声一点(qǐng zài dà shēng yī diǎn)。",
    ),
    "把它还给我(bǎ tā huán gěi wǒ)、请再大声一点(qǐng zài dà shēng yī diǎn)。",
  );
  assert.equal(
    completeMandarinPinyinForTemplateBullet("把(bǎ)の後に対象を置きます。"),
    "把(bǎ)の後に対象を置きます。",
  );
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

test("Japanese examples are not transliterated as Mandarin", () => {
  const phrase = "承知いたしました。明日の朝に手配いたします。";
  assert.deepEqual(overwriteStructuredSectionPinyin([
    { heading: "返答するときの例", examples: [{ phrase, translation: phrase, reading: "wrong", pinyin: "wrong" }] },
  ]), [
    { heading: "返答するときの例", examples: [{ phrase, translation: phrase, reading: "", pinyin: "" }] },
  ]);
});

test("bag suffix and the observed speaking complement use neutral tone", () => {
  assert.equal(toMandarinPinyin("不需要袋子。"), "bù xū yào dài zi.");
  assert.equal(toMandarinPinyin("请说得再慢一点。"), "qǐng shuō de zài màn yī diǎn.");
  assert.equal(toMandarinPinyin("说得很慢"), "shuō de hěn màn");
  assert.equal(toMandarinPinyin("他得到了礼物。"), "tā dé dào le lǐ wù.");
});

for (const phrase of ["只住一晚", "我只住一晚。", "我们只需要两个袋子。", "好的，只需要两个袋子，对吗？", "我想延长住宿两晚，而不是只住一晚。", "不是只需要一个。"]) {
  test(`only before the observed predicates uses zhǐ: ${phrase}`, () => {
    assert.match(toMandarinPinyin(phrase), /zhǐ (?:zhù|xū)/);
    assert.doesNotMatch(toMandarinPinyin(phrase), /zhī (?:zhù|xū)/);
  });
}

for (const phrase of ["一只猫", "两只手", "这只住在树上的鸟", "有一只需要照顾的猫。", "我有三只住在这里的猫。", "那只需要治疗的鸟"]) {
  test(`classifier before a noun or relative clause keeps zhī: ${phrase}`, () => {
    assert.match(toMandarinPinyin(phrase), /zhī/);
    assert.doesNotMatch(toMandarinPinyin(phrase), /zhǐ/);
  });
}

test("only and classifier readings remain independent in mixed and astral text", () => {
  assert.equal(toMandarinPinyin("🙂，我只需要一只猫。"), "🙂, wǒ zhǐ xū yào yī zhī māo.");
  assert.equal(toMandarinPinyin("只要两个袋子。"), "zhǐ yào liǎng gè dài zi.");
});

test("Japanese prose and night counts cannot acquire marked Mandarin readings", () => {
  const result = addMandarinPinyinToMarkedChineseTerms("{{一泊}}、{{二泊}}、{{3泊}}、{{二泊三日}}、{{延長したいです}}。中国語は{{两晚}}と{{三晚}}です。");
  assert.equal(result, "一泊、二泊、3泊、二泊三日、延長したいです。中国語は两晚(liǎng wǎn)と三晚(sān wǎn)です。");
  assert.equal(addMandarinPinyinToMarkedChineseTerms(result), result);
  assert.equal(addMandarinPinyinToMarkedChineseTerms("一泊(yī bó)は一泊です。"), "一泊は一泊です。");
  assert.equal(completeMandarinPinyinForTemplateBullet("{{一泊}}"), "一泊");
});

test("Japanese labels and legitimate Chinese terms keep text without swallowing prefixes", () => {
  assert.equal(addMandarinPinyinToMarkedChineseTerms("{{意味}}と{{量詞张}}、{{停泊}}、{{住宿}}、{{泊}}"), "意味と量詞张(zhāng)、停泊(tíng bó)、住宿(zhù sù)、泊(bó)");
});
