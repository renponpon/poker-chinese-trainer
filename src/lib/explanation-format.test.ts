import assert from "node:assert/strict";
import test from "node:test";
import { formatExplanationForReading, formatExplanationWithStructuredSections } from "./explanation-format";

test("Chinese context survives structured generation and repeated saved explanation display", () => {
  const options = { direction: "ja-to-zh" as const, japaneseText: "予約時間だけ30分遅らせたいです。", chineseText: "我只想把预约时间推迟30分钟。", markedOnly: true };
  const generated = formatExplanationWithStructuredSections("", [
    { heading: "単語分解と骨組み", bullets: ["{{只}}は限定です。{{一部}}だけを変更します。"] },
    { heading: "入れ替えテンプレ", bullets: ["{{只想把预约时间推迟30分钟}}（予約時間だけ30分遅らせたい）"] },
  ], undefined, options);
  assert.match(generated, /只\(zhǐ\)/);
  assert.match(generated, /只想把预约时间推迟30分钟\(zhǐ xiǎng bǎ yù yuē shí jiān tuī chí 30 fēn zhōng\)/);
  assert.doesNotMatch(generated, /一部\(/);
  for (let pass = 0; pass < 3; pass += 1) {
    assert.equal(formatExplanationForReading(generated, options), generated);
    assert.equal(formatExplanationForReading(generated, { ...options, markedOnly: false }), generated);
  }
});

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

test("all four generated word explanations survive instead of silently keeping only two", () => {
  const bullets = ["{{所有}}はすべてです。", "{{的}}は修飾をつなぎます。", "{{筹码}}はゲームのチップです。", "数量の範囲を変えません。"];
  const result = formatExplanationWithStructuredSections("", [{ heading: "単語分解と直訳の構造", bullets, examples: [] }]);
  assert.equal(result.split("\n").filter((line) => line.startsWith("- ")).length, 4);
  assert.match(result, /筹码\(chóu mǎ\)はゲームのチップです。/);
  assert.match(result, /数量の範囲を変えません。/);
  assert.equal(formatExplanationForReading(result), result);
});

test("all complete example pairs survive structured generation and repeated display", () => {
  const examples = [
    { phrase: "好的。", translation: "わかりました。" },
    { phrase: "谢谢。", translation: "ありがとうございます。" },
    { phrase: "没问题。", translation: "問題ありません。" },
  ];
  const result = formatExplanationWithStructuredSections("", [{ heading: "相手の想定返答", bullets: [], examples }]);
  for (const example of examples) {
    assert.ok(result.includes(example.phrase));
    assert.ok(result.includes(example.translation));
  }
  assert.equal(formatExplanationForReading(result), result);
});

test("structured templates do not duplicate ellipsis readings or pronounce Japanese slots", () => {
  const result = formatExplanationWithStructuredSections("", [{
    heading: "入れ替えテンプレ", bullets: ["{{如果……，就……}}で条件を示します。", "{{所有＋名詞}}、{{不要＋動作}}の形です。"], examples: [],
  }]);
  assert.equal(result.match(/rú guǒ/g)?.length, 1);
  assert.match(result, /所有\(suǒ yǒu\)＋名詞/);
  assert.match(result, /不要\(bù yào\)＋動作/);
  assert.doesNotMatch(result, /míng cí|dòng zuò|\([^)]*\(/);
  assert.equal(formatExplanationForReading(result), result);
});

test("saved English explanations use direction at display without changing stored text", () => {
  const original = "## 意味\n- {{部屋}}(bù wū)はroomです。\n\n## 返答するときの例\n了解\nliǎo jiě\n了解";
  const options = { direction: "en-to-ja" as const };
  const formatted = formatExplanationForReading(original, options);
  assert.equal(formatted, "## 意味\n- 部屋はroomです。\n\n## 返答するときの例\n了解\n了解");
  assert.equal(formatExplanationForReading(formatted, options), formatted);
  assert.match(original, /bù wū/);
});

test("strict template formatting uses explicit Chinese spans instead of Han-only label guesses", () => {
  const result = formatExplanationWithStructuredSections("", [{ heading: "入れ替えテンプレ", bullets: ["完成例：{{今天别跟我说话。}}／今日は話しかけないで。", "補足：置換対象。"] }], undefined, { direction: "ja-to-zh", markedOnly: true });
  assert.match(result, /完成例：今天别跟我说话\(jīn tiān bié gēn wǒ shuō huà\)/);
  assert.match(result, /補足：置換対象。/);
  assert.doesNotMatch(result, /完成例\(|補足\(|置換対象\(/);
});
