import type { Phrase } from "./types";

const STARTER_CREATED_AT = "2026-05-22T00:00:00.000Z";

type StarterSeed = Omit<
  Phrase,
  | "id"
  | "createdAt"
  | "direction"
  | "shouldDrill"
  | "source"
  | "usedAt"
  | "audioUrl"
  | "sourceLanguage"
  | "targetLanguage"
  | "sourceText"
  | "targetText"
  | "reading"
  | "readingType"
> & {
  id: string;
};

const STARTER_SEEDS: StarterSeed[] = [
  {
    id: "starter-001-really",
    japanese: "本当ですか？",
    chinese: "真的吗？",
    pinyin: "zhēn de ma?",
    categoryId: "other",
    explanation: `【単語分解と骨組み】
真的(zhēn de)＝本当に、吗(ma)＝疑問の語尾。

【使用する場面】
相手の話を疑問・確認したい時。驚いた時にも使えます。

【他の自然な言い方】
- 是吗？(shì ma?)
- 真的假的？(zhēn de jiǎ de?)

【相手の想定返答】
- 真的。(zhēn de.)
- 对。(duì.)

【発音のコツ】
「吗(ma)」は軽く上げると疑問らしく聞こえます。`,
  },
  {
    id: "starter-002-japanese",
    japanese: "私は日本人です",
    chinese: "我是日本人。",
    pinyin: "wǒ shì Rìběn rén.",
    categoryId: "other",
    explanation: `【単語分解と骨組み】
我(wǒ)＝私、是(shì)＝です、日本人(Rìběn rén)＝日本人。

【使用する場面】
初対面の自己紹介。国籍を伝える基本フレーズです。

【他の自然な言い方】
- 我来自日本。(wǒ láizì Rìběn.)
- 我是日本的。(wǒ shì Rìběn de.)

【相手の想定返答】
- 你好。(nǐ hǎo.)
- 我也是日本人。(wǒ yě shì Rìběn rén.)

【発音のコツ】
「是(shì)」をはっきり言うと、自己紹介が伝わりやすくなります。`,
  },
  {
    id: "starter-003-where-from",
    japanese: "あなたは何人ですか？",
    chinese: "你是哪里人？",
    pinyin: "nǐ shì nǎlǐ rén?",
    categoryId: "other",
    explanation: `【単語分解と骨組み】
你(nǐ)＝あなた、是(shì)＝です、哪里(nǎlǐ)＝どこ、人(rén)＝人。

【使用する場面】
相手の出身地や国籍を聞く時。カジュアルな会話向けです。

【他の自然な言い方】
- 你是哪国人？(nǐ shì nǎ guó rén?)
- 你来自哪里？(nǐ láizì nǎlǐ?)

【相手の想定返答】
- 我是日本人。(wǒ shì Rìběn rén.)
- 我是中国人。(wǒ shì Zhōngguó rén.)

【発音のコツ】
「哪里(nǎlǐ)」は「ナーリー」と続けて言うと自然です。`,
  },
  {
    id: "starter-004-tea",
    japanese: "お茶を一杯ください",
    chinese: "请给我一杯茶。",
    pinyin: "qǐng gěi wǒ yì bēi chá.",
    categoryId: "restaurant",
    explanation: `【単語分解と骨組み】
请(qǐng)＝ください、给(gěi)＝くれる、我(wǒ)＝私、一杯(yì bēi)＝一杯、茶(chá)＝お茶。

【使用する場面】
レストランやカフェで飲み物を頼む時。

【他の自然な言い方】
- 来一杯茶。(lái yì bēi chá.)
- 我要茶。(wǒ yào chá.)

【相手の想定返答】
- 好的。(hǎo de.)
- 马上来。(mǎshàng lái.)

【発音のコツ】
「请(qǐng)」を先に言うと、丁寧な依頼になります。`,
  },
  {
    id: "starter-005-restroom",
    japanese: "トイレはどこですか？",
    chinese: "洗手间在哪里？",
    pinyin: "xǐshǒujiān zài nǎlǐ?",
    categoryId: "other",
    explanation: `【単語分解と骨組み】
洗手间(xǐshǒujiān)＝トイレ、在(zài)＝ある、哪里(nǎlǐ)＝どこ。

【使用する場面】
店や施設でトイレの場所を聞く時。非常に使います。

【他の自然な言い方】
- 厕所在哪里？(cèsuǒ zài nǎlǐ?)
- 卫生间在哪？(wèishēngjiān zài nǎ?)

【相手の想定返答】
- 在那边。(zài nàbiān.)
- 二楼。(èr lóu.)

【発音のコツ】
「在哪里？(zài nǎlǐ?)」は語尾を少し上げると質問に聞こえます。`,
  },
  {
    id: "starter-006-what-is-this",
    japanese: "これは何ですか？",
    chinese: "这是什么？",
    pinyin: "zhè shì shénme?",
    categoryId: "shopping",
    explanation: `【単語分解と骨組み】
这(zhè)＝これ、是(shì)＝です、什么(shénme)＝何。

【使用する場面】
物の名前や意味を聞く時。買い物でもよく使います。

【他の自然な言い方】
- 这个是什么？(zhège shì shénme?)
- 那是什么？(nà shì shénme?)

【相手の想定返答】
- 这是茶。(zhè shì chá.)
- 这是菜单。(zhè shì càidān.)

【発音のコツ】
「什么(shénme)」は軽く、はっきり発音すると聞き取りやすいです。`,
  },
  {
    id: "starter-007-excuse-me",
    japanese: "すみません",
    chinese: "不好意思。",
    pinyin: "bù hǎo yìsi.",
    categoryId: "other",
    explanation: `【単語分解と骨組み】
不好意思(bù hǎo yìsi)＝すみません、失礼しました。

【使用する場面】
人に話しかける前、邪魔した時、軽く謝る時。

【他の自然な言い方】
- 对不起。(duìbuqǐ.)
- 打扰一下。(dǎrǎo yíxià.)

【相手の想定返答】
- 没事。(méishì.)
- 你说。(nǐ shuō.)

【発音のコツ】
短く一言で使えるので、まず声をかける時に便利です。`,
  },
  {
    id: "starter-008-no-problem",
    japanese: "大丈夫です",
    chinese: "没关系。",
    pinyin: "méi guānxi.",
    categoryId: "other",
    explanation: `【単語分解と骨組み】
没(méi)＝ない、关系(guānxi)＝関係、没关系＝問題ない。

【使用する場面】
相手が謝った時、失敗をフォローする時。

【他の自然な言い方】
- 没事。(méishì.)
- 不要紧。(bù yàojǐn.)

【相手の想定返答】
- 谢谢。(xièxie.)
- 好的。(hǎo de.)

【発音のコツ】
落ち着いたトーンで言うと、相手を安心させやすいです。`,
  },
  {
    id: "starter-009-chinese-not-good",
    japanese: "中国語があまり上手ではありません",
    chinese: "我的中文不太好。",
    pinyin: "wǒ de Zhōngwén bú tài hǎo.",
    categoryId: "other",
    explanation: `【単語分解と骨組み】
我的(wǒ de)＝私の、中文(Zhōngwén)＝中国語、不太(bú tài)＝あまり〜ない、好(hǎo)＝上手。

【使用する場面】
会話の前に、自分の中国語がまだ下手だと伝える時。

【他の自然な言い方】
- 我中文不好。(wǒ Zhōngwén bù hǎo.)
- 我还在学中文。(wǒ hái zài xué Zhōngwén.)

【相手の想定返答】
- 没关系。(méi guānxi.)
- 你说吧。(nǐ shuō ba.)

【発音のコツ】
「不太(bú tài)」をはっきり言うと、謙遜のニュアンスが伝わります。`,
  },
  {
    id: "starter-010-english",
    japanese: "英語を話せますか？",
    chinese: "你会说英语吗？",
    pinyin: "nǐ huì shuō Yīngyǔ ma?",
    categoryId: "other",
    explanation: `【単語分解と骨組み】
你(nǐ)＝あなた、会(huì)＝できる、说(shuō)＝話す、英语(Yīngyǔ)＝英語。

【使用する場面】
言語が通じるか確認する時。英語に切り替えたい時。

【他の自然な言い方】
- 可以说英语吗？(kěyǐ shuō Yīngyǔ ma?)
- 你懂英语吗？(nǐ dǒng Yīngyǔ ma?)

【相手の想定返答】
- 会一点。(huì yìdiǎn.)
- 不会。(bú huì.)

【発音のコツ】
「会(huì)」と「说(shuō)」を区別して発音すると分かりやすいです。`,
  },
  {
    id: "starter-011-price",
    japanese: "いくらですか？",
    chinese: "多少钱？",
    pinyin: "duōshao qián?",
    categoryId: "shopping",
    explanation: `【単語分解と骨組み】
多少(duōshao)＝いくつ・いくら、钱(qián)＝お金。

【使用する場面】
値段を聞く時。市場やお店で必須です。

【他の自然な言い方】
- 这个多少钱？(zhège duōshao qián?)
- 价格是多少？(jiàgé shì duōshao?)

【相手の想定返答】
- 十块。(shí kuài.)
- 一百元。(yìbǎi yuán.)

【発音のコツ】
「多少钱？」は短く区切って言うと聞き取りやすいです。`,
  },
  {
    id: "starter-012-this-one",
    japanese: "これをください",
    chinese: "我要这个。",
    pinyin: "wǒ yào zhège.",
    categoryId: "shopping",
    explanation: `【単語分解と骨組み】
我(wǒ)＝私、要(yào)＝欲しい・ください、这个(zhège)＝これ。

【使用する場面】
買い物や注文で「これ」を指して頼む時。

【他の自然な言い方】
- 给我这个。(gěi wǒ zhège.)
- 来这个。(lái zhège.)

【相手の想定返答】
- 好的。(hǎo de.)
- 还要别的吗？(hái yào biéde ma?)

【発音のコツ】
物を指しながら「这个(zhège)」と言うと伝わりやすいです。`,
  },
  {
    id: "starter-013-recommendation",
    japanese: "おすすめは何ですか？",
    chinese: "你推荐什么？",
    pinyin: "nǐ tuījiàn shénme?",
    categoryId: "restaurant",
    explanation: `【単語分解と骨組み】
你(nǐ)＝あなた、推荐(tuījiàn)＝おすすめ、什么(shénme)＝何。

【使用する場面】
レストランでおすすめを聞く時。

【他の自然な言い方】
- 有什么推荐？(yǒu shénme tuījiàn?)
- 招牌菜是什么？(zhāopái cài shì shénme?)

【相手の想定返答】
- 这个很好吃。(zhège hěn hǎochī.)
- 我推荐鱼。(wǒ tuījiàn yú.)

【発音のコツ】
「推荐(tuījiàn)」は「トゥイジエン」と続けて言うと自然です。`,
  },
  {
    id: "starter-014-not-spicy",
    japanese: "辛くしないでください",
    chinese: "不要辣。",
    pinyin: "bú yào là.",
    categoryId: "restaurant",
    explanation: `【単語分解と骨組み】
不要(bú yào)＝〜しないで、辣(là)＝辛い・唐辛子。

【使用する場面】
料理の辛さを避けたい時。注文時に必須級です。

【他の自然な言い方】
- 不要放辣。(bú yào fàng là.)
- 我不吃辣。(wǒ bù chī là.)

【相手の想定返答】
- 好的。(hǎo de.)
- 不辣。(bù là.)

【発音のコツ】
「不要(bú yào)」をはっきり言うと、要望が伝わりやすいです。`,
  },
  {
    id: "starter-015-check",
    japanese: "会計をお願いします",
    chinese: "买单。",
    pinyin: "mǎi dān.",
    categoryId: "restaurant",
    explanation: `【単語分解と骨組み】
买单(mǎi dān)＝会計お願いします。店員を呼ぶ時の定番表現です。

【使用する場面】
食事の後、会計を頼む時。中国では「买单」が一般的です。

【他の自然な言い方】
- 结账。(jiézhàng.)
- 买单买单。(mǎi dān mǎi dān.)

【相手の想定返答】
- 好的。(hǎo de.)
- 一共一百元。(yígòng yìbǎi yuán.)

【発音のコツ】
短い一言なので、店員の前でそのまま言えます。`,
  },
  {
    id: "starter-016-wait",
    japanese: "ちょっと待ってください",
    chinese: "请等一下。",
    pinyin: "qǐng děng yíxià.",
    categoryId: "other",
    explanation: `【単語分解と骨組み】
请(qǐng)＝ください、等(děng)＝待つ、一下(yíxià)＝少しの間。

【使用する場面】
相手に少し時間をもらいたい時。

【他の自然な言い方】
- 稍等。(shāo děng.)
- 等一下。(děng yíxià.)

【相手の想定返答】
- 好的。(hǎo de.)
- 没问题。(méi wèntí.)

【発音のコツ】
「一下(yíxià)」を軽く付けると、柔らかい依頼になります。`,
  },
];

export const STARTER_PHRASES: Phrase[] = STARTER_SEEDS.map((phrase) => ({
  ...phrase,
  sourceLanguage: "ja",
  targetLanguage: "zh",
  sourceText: phrase.japanese,
  targetText: phrase.chinese,
  reading: phrase.pinyin,
  readingType: "pinyin",
  audioUrl: null,
  createdAt: STARTER_CREATED_AT,
  direction: "ja-to-zh",
  shouldDrill: true,
  source: "prototype",
  usedAt: null,
}));
