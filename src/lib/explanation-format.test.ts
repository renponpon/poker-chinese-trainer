import assert from "node:assert/strict";
import test from "node:test";
import { formatExplanationWithStructuredSections } from "./explanation-format";

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
        "把手机还给我(bǎ shǒu jī hái gěi wǒ)のように使えます。",
      ],
    },
  ]);

  assert.match(result, /还给我\(huán gěi wǒ\)は还\(huán\)と给我\(gěi wǒ\)/);
  assert.match(result, /把手机还给我\(bǎ shǒu jī huán gěi wǒ\)/);
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
