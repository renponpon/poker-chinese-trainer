import assert from "node:assert/strict";
import test from "node:test";
import { formatExplanationForReading, formatExplanationWithStructuredSections } from "./explanation-format";

test("structured explanation corrects return readings in bullets and templates", () => {
  const result = formatExplanationWithStructuredSections("", [
    {
      heading: "単語分解と骨組み",
      bullets: [
        "还给我(huán gěi wǒ)は还(hái)と给我(gěi wǒ)が組み合わさった表現です。",
      ],
    },
    {
      heading: "入れ替えテンプレ",
      bullets: [
        "把手机还给我、请再大声一点(qǐng zài dà shēng yī diǎn)。",
      ],
    },
  ]);

  assert.match(result, /还给我\(huán gěi wǒ\)は还\(huán\)と给我\(gěi wǒ\)/);
  assert.match(result, /把手机还给我\(bǎ shǒu jī huán gěi wǒ\)/);
  assert.match(result, /请再大声一点\(qǐng zài dà shēng yī diǎn\)/);
  assert.doesNotMatch(result, /还\(hái\)と给我/);
  assert.doesNotMatch(result, /hái gěi/);
});

test("an explicit contrast keeps additive hái distinct from return huán", () => {
  const result = formatExplanationWithStructuredSections("", [
    {
      heading: "使い分け",
      bullets: ["还(hái)は『さらに』、还给(huán gěi)は『返す』を表します。"],
    },
  ]);

  assert.match(result, /还\(hái\)は『さらに』/);
  assert.match(result, /还给\(huán gěi\)は『返す』/);
});

test("immediate return replies share the corrected reading in structured and legacy explanations", () => {
  const structured = formatExplanationWithStructuredSections("", [{
    heading: "相手の想定返答",
    examples: [{ phrase: "好的，这就还给您。", reading: "hǎo de, zhè jiù hái gěi nín.", translation: "わかりました。すぐお返しします。" }],
  }]);
  const legacy = formatExplanationForReading("## 想定される相手の返答\n好的，这就还给您。\nhǎo de, zhè jiù hái gěi nín.\nわかりました。すぐお返しします。");
  for (const result of [structured, legacy]) {
    assert.match(result, /hǎo de, zhè jiù huán gěi nín\./);
    assert.doesNotMatch(result, /hái gěi/);
    assert.match(result, /わかりました。すぐお返しします。/);
  }
});

test("live follow-up return variants use huán without changing Japanese translations", () => {
  const result = formatExplanationForReading("【他の自然な言い方】\n知道了，马上还您。\nzhī dào le, mǎ shàng hái nín.\nわかりました。すぐお返しします。\n\n【類似・関連フレーズ】\n好了，现在还给你。\nhǎo le, xiàn zài hái gěi nǐ.\n終わったので、今あなたに返します。");
  assert.match(result, /mǎ shàng huán nín/);
  assert.match(result, /xiàn zài huán gěi nǐ/);
  assert.doesNotMatch(result, /hái/);
  assert.match(result, /終わったので、今あなたに返します。/);
});

test("Japanese replies keep their text without generating Mandarin readings", () => {
  const phrase = "かしこまりました。明日の午前中にお届けします。";
  const reading = "かしこまりました. míng rì の wǔ qián zhōng にお jiè けします.";
  const structured = formatExplanationWithStructuredSections("", [{
    heading: "返答するときの例", examples: [{ phrase, reading, translation: phrase }],
  }]);
  const legacy = formatExplanationForReading(`## 返答するときの例\n${phrase}\n${reading}\n${phrase}`);
  for (const result of [structured, legacy]) {
    assert.equal(result, `## 返答するときの例\n${phrase}\n${phrase}`);
    assert.equal(formatExplanationForReading(result), result);
  }
});

test("a marked multi-clause template gets each reading once, without a duplicate full-line reading", () => {
  const result = formatExplanationWithStructuredSections("", [{
    heading: "入れ替えテンプレ",
    bullets: ["{{请明天下午送来，不要今天上午送来。}}"],
  }]);
  assert.equal(result.match(/qǐng míng tiān xià wǔ sòng lái/g)?.length, 1);
  assert.equal(result.match(/bù yào jīn tiān shàng wǔ sòng lái/g)?.length, 1);
  assert.match(result, /请明天下午送来\(qǐng míng tiān xià wǔ sòng lái\)/);
  assert.match(result, /不要今天上午送来\(bù yào jīn tiān shàng wǔ sòng lái\)/);
  assert.doesNotMatch(result, /- \(/);
  assert.equal(formatExplanationForReading(result), result);
});

test("each structured template bullet remains a single complete item after repeated formatting", () => {
  const result = formatExplanationWithStructuredSections("", [{
    heading: "入れ替えテンプレ",
    bullets: [
      "数量を変更する場合は数量詞を入れ替えます。例：{{两个都打包，只要一个袋子。}}（二つとも持ち帰りで、袋は一つだけください。）",
      "袋の種類を特定する場合は袋の前に語句を加えます。例：{{三个都打包，只要两个塑料袋。}}（三つとも持ち帰りで、ビニール袋は二つだけください。）",
    ],
  }]);
  assert.equal(result.split("\n").filter((line) => line.startsWith("- ")).length, 2);
  assert.match(result, /两个都打包\(liǎng gè dōu dǎ bāo\)，只要一个袋子\(zhǐ yào yī gè dài zi\)。\（二つとも持ち帰りで、袋は一つだけください。\）/);
  assert.match(result, /袋は二つだけください。/);
  assert.equal(formatExplanationForReading(result), result);
});

test("legacy explicit bullets retain sentence boundaries and all text", () => {
  const bullet = "- ホテルのフロントなどで使う表現です。延長する泊数を指定して希望を伝えます。相手の確認を受けてから手続きが進みます。";
  const result = formatExplanationForReading(`## 使用する場面\n${bullet}`);
  assert.equal(result, `## 使用する場面\n${bullet}`);
  assert.equal(formatExplanationForReading(result), result);
});
