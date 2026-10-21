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

for (const [source, expected] of [
  ["{{如果……，就……}}", "如果(rú guǒ)……，就(jiù)……"],
  ["{{所有＋名詞}}", "所有(suǒ yǒu)＋名詞"],
  ["{{不要＋動作}}", "不要(bù yào)＋動作"],
  ["{{名詞}}、{{動詞}}、{{動作}}", "名詞、動詞、動作"],
  ["{{你好(nǐ hǎo)}}", "你好(nǐ hǎo)"],
  ["{{你好}}(nǐ hǎo)", "你好(nǐ hǎo)"],
  ["{{你好}}（nǐ hǎo）", "你好(nǐ hǎo)"],
  ["{{你好}}（こんにちは）", "你好(nǐ hǎo)（こんにちは）"],
  ["{{A4纸}}", "A4纸(A4 zhǐ)"],
] as const) {
  test(`marked text preserves annotations and Japanese slots without duplicate readings: ${source}`, () => {
    for (const format of [addMandarinPinyinToMarkedChineseTerms, completeMandarinPinyinForTemplateBullet]) {
      const result = format(source);
      assert.equal(result, expected);
      assert.equal(format(result), expected);
      assert.equal(addMandarinPinyinToMarkedChineseTerms(result), expected);
    }
  });
}

test("existing readings are atomic even when they contain punctuation or ellipses", () => {
  const source = "如果……(rú guǒ ……)、你好，你好(nǐ hǎo, nǐ hǎo)。";
  const result = completeMandarinPinyinForTemplateBullet(source);
  assert.doesNotMatch(result, /\([^)]*\(/);
  assert.equal(completeMandarinPinyinForTemplateBullet(result), result);
});

test("mixed Japanese explanations and English parenthetical notes retain their content", () => {
  const source = "{{你好}}（挨拶です）。説明文はそのままです。{{钥匙}} (key)";
  const result = addMandarinPinyinToMarkedChineseTerms(source);
  assert.equal(result, "你好(nǐ hǎo)（挨拶です）。説明文はそのままです。钥匙(yào shi) (key)");
  assert.equal(addMandarinPinyinToMarkedChineseTerms(result), result);
});

test("previously saved duplicate readings and placeholder readings are repaired only in display", () => {
  const source = "如果……(rú guǒ ……)(rú guǒ ……(rú guǒ ……))，就……(jiù ……)。所有＋名詞(suǒ yǒu ＋ míng cí)";
  const result = addMandarinPinyinToMarkedChineseTerms(source);
  assert.equal(result, "如果(rú guǒ)……，就(jiù)……。所有(suǒ yǒu)＋名詞");
  assert.equal(addMandarinPinyinToMarkedChineseTerms(result), result);
  assert.equal(addMandarinPinyinToMarkedChineseTerms("你好(nǐ hǎo)（こんにちは） (hello)"), "你好(nǐ hǎo)（こんにちは） (hello)");
  assert.equal(addMandarinPinyinToMarkedChineseTerms("好(hǎo)（hào は別の読み）"), "好(hǎo)（hào は別の読み）");
});

test("template labels outside Chinese markers never acquire readings", () => {
  for (const label of ["例", "完成例", "置換例", "日本語訳"]) {
    const source = `${label}：{{今天别跟我说话。}}／今日は話しかけないで。`;
    const result = completeMandarinPinyinForTemplateBullet(source);
    assert.ok(result.startsWith(`${label}：`));
    assert.match(result, /今天别跟我说话\(jīn tiān bié gēn wǒ shuō huà\)/);
    assert.equal(completeMandarinPinyinForTemplateBullet(result), result);
  }
});

test("known Chinese fills omitted markers without guessing other Han-only words", () => {
  const options = { direction: "ja-to-zh" as const, chineseText: "现在别跟我说话。", japaneseText: "今は話しかけないで。", markedOnly: true };
  const source = "現在の状態です。现在は今を表します。{{今}}と{{話しかけないで}}は日本語。完成例：{{别跟我说话}}。未知：候補。";
  const result = completeMandarinPinyinForTemplateBullet(source, options);
  assert.equal(result, "現在の状態です。现在(xiàn zài)は今を表します。今と話しかけないでは日本語。完成例：别跟我说话(bié gēn wǒ shuō huà)。未知：候補。");
  assert.equal(completeMandarinPinyinForTemplateBullet(result, options), result);
});

test("English context removes only pronunciation markup and preserves explanatory text", () => {
  const options = { direction: "en-to-ja" as const };
  const source = "{{部屋}}(bù wū)＝room、鍵(jiàn)はkey。部屋(room)（日本語訳）、喫茶店(café)";
  const result = addMandarinPinyinToMarkedChineseTerms(source, options);
  assert.equal(result, "部屋＝room、鍵はkey。部屋(room)（日本語訳）、喫茶店(café)");
  assert.equal(addMandarinPinyinToMarkedChineseTerms(result, options), result);
  assert.deepEqual(overwriteStructuredSectionPinyin([{ examples: [{ phrase: "了解", reading: "liǎo jiě", translation: "了解" }] }], options), [{ examples: [{ phrase: "了解", reading: "", pinyin: "", translation: "了解" }] }]);
});

test("Chinese homographs explicitly marked in Chinese context keep readings", () => {
  const options = { direction: "zh-to-ja" as const, chineseText: "今天是星期一。", japaneseText: "今日は月曜日です。" };
  assert.equal(addMandarinPinyinToMarkedChineseTerms("{{今天}}は「今日」です。", options), "今天(jīn tiān)は「今日」です。");
  assert.equal(addMandarinPinyinToMarkedChineseTerms("{{水}}", { ...options, chineseText: "我想要水。", japaneseText: "水が欲しいです。" }), "水(shuǐ)");
});

for (const phrase of ["得先走", "我得先走。", "你们还得先等一下。", "我不是不想去，只是得先把手头的事做完。", "🙂，得先走。"]) {
  test(`obligation before 先 uses děi: ${phrase}`, () => {
    assert.match(toMandarinPinyin(phrase), /děi xiān/);
  });
}

for (const phrase of ["取得先机", "获得先进技术", "所得先存起来", "不得先走", "只得先走", "我记得先洗手。", "说得先后不一"]) {
  test(`non-modal 得 is not rewritten: ${phrase}`, () => {
    assert.doesNotMatch(toMandarinPinyin(phrase), /děi/);
  });
}

for (const phrase of ["只想", "我只想买一只鸟。", "而是只想把预约时间推迟30分钟。", "不是只想去。", "🙂，只想休息。"]) {
  test(`restrictive 只 before 想 uses zhǐ: ${phrase}`, () => {
    assert.match(toMandarinPinyin(phrase), /zhǐ xiǎng/);
  });
}

for (const phrase of ["一只想飞的鸟", "这只想飞的鸟", "那只想睡觉的猫", "有两只想吃鱼的猫"]) {
  test(`classifier with 想 relative clause remains zhī: ${phrase}`, () => {
    assert.match(toMandarinPinyin(phrase), /zhī xiǎng/);
    assert.doesNotMatch(toMandarinPinyin(phrase), /zhǐ/);
  });
}

test("marked fragments inherit unambiguous readings from the full Chinese sentence", () => {
  const options = { direction: "ja-to-zh" as const, chineseText: "我只想休息，只是得先把工作做完。" };
  const result = addMandarinPinyinToMarkedChineseTerms("{{只}}は限定、{{得}}は必要を表します。", options);
  assert.equal(result, "只(zhǐ)は限定、得(děi)は必要を表します。");
  assert.equal(addMandarinPinyinToMarkedChineseTerms(result, options), result);
  assert.equal(toMandarinPinyin("只", "我有一只猫。"), "zhī");
  assert.equal(toMandarinPinyin("只", "我只想买一只猫。"), toMandarinPinyin("只"));
  assert.equal(toMandarinPinyin("得", "得到礼物后，我得先回家。"), toMandarinPinyin("得"));
});

test("mixed alphanumeric Chinese markers remain atomic on repeated formatting", () => {
  for (const phrase of ["只想把预约时间推迟30分钟", "把时间推迟30分钟", "请打印A4纸", "第3次", "只想推迟30分钟再等5分钟"]) {
    const options = { direction: "ja-to-zh" as const, chineseText: phrase, japaneseText: "予約時間を変更したい。", markedOnly: true };
    for (const format of [addMandarinPinyinToMarkedChineseTerms, completeMandarinPinyinForTemplateBullet]) {
      const expected = `${phrase}(${toMandarinPinyin(phrase)})`;
      let result = `{{${phrase}}}`;
      for (let pass = 0; pass < 4; pass += 1) {
        result = format(result, options);
        assert.equal(result, expected);
      }
      assert.equal(format(phrase, options), expected);
    }
  }
});

test("Japanese 一部 does not gain a reading unless grounded in the Chinese sentence", () => {
  const options = { direction: "ja-to-zh" as const, chineseText: "只想推迟30分钟。", japaneseText: "時間だけ変更したい。" };
  for (const source of ["{{一部}}だけ変更します。", "一部(yī bù)だけ変更します。"]) {
    assert.equal(addMandarinPinyinToMarkedChineseTerms(source, options), "一部だけ変更します。");
  }
  assert.equal(addMandarinPinyinToMarkedChineseTerms("{{一部}}は映画の数え方です。", { ...options, chineseText: "看一部电影。" }), "一部(yī bù)は映画の数え方です。");
  assert.equal(addMandarinPinyinToMarkedChineseTerms("{{一部分}}", options), `一部分(${toMandarinPinyin("一部分")})`);
});
