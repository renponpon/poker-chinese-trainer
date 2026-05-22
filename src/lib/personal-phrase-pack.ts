import type {
  PhrasePackLevel,
  PhrasePackProfile,
  PhrasePackScene,
  PhrasePackTone,
} from "./types";

export const PHRASE_PACK_PROFILE_KEY = "poker-chinese-phrase-pack-profile-v1";
export const PHRASE_PACK_SCENE_LIMIT = 3;
export const PHRASE_PACK_DETAILS_MAX_CHARS = 120;

export type PhrasePackOption<T extends string> = {
  id: T;
  label: string;
  description?: string;
  categoryId?: string | null;
};

export const PHRASE_PACK_SCENE_OPTIONS: Array<PhrasePackOption<PhrasePackScene>> = [
  { id: "auto", label: "お任せ", categoryId: null },
  { id: "casino", label: "カジノ", categoryId: "poker-table" },
  { id: "restaurant", label: "レストラン・カフェ", categoryId: "restaurant" },
  { id: "shopping", label: "買い物", categoryId: "shopping" },
  { id: "transport", label: "移動・タクシー", categoryId: "transport" },
  { id: "hotel", label: "ホテル", categoryId: "hotel" },
  { id: "work", label: "仕事・打ち合わせ", categoryId: "work" },
  { id: "daily", label: "日常生活", categoryId: "other" },
];

export const PHRASE_PACK_LEVEL_OPTIONS: Array<PhrasePackOption<PhrasePackLevel>> = [
  {
    id: "entry",
    label: "初級",
    description: "単語や短い定型句が中心",
  },
  {
    id: "basic",
    label: "初中級",
    description: "日常場面の短い会話ができる",
  },
  {
    id: "intermediate",
    label: "中級",
    description: "ある程度自然に話せる",
  },
  {
    id: "advanced",
    label: "上級",
    description: "仕事や複雑な内容も扱える",
  },
];

export const PHRASE_PACK_TONE_OPTIONS: Array<PhrasePackOption<PhrasePackTone>> = [
  {
    id: "short",
    label: "とにかく短く通じる",
    description: "その場で言いやすい短い表現",
  },
  {
    id: "natural",
    label: "自然な会話っぽい",
    description: "現地で不自然になりにくい表現",
  },
  {
    id: "polite",
    label: "丁寧で失礼になりにくい",
    description: "店員・スタッフ・仕事相手にも使いやすい表現",
  },
  {
    id: "detailed",
    label: "少し詳しく説明できる",
    description: "理由や条件まで伝えやすい表現",
  },
  {
    id: "auto",
    label: "おまかせ",
    description: "場面に合わせて自動調整",
  },
];

const sceneIds = new Set(PHRASE_PACK_SCENE_OPTIONS.map((option) => option.id));
const levelIds = new Set(PHRASE_PACK_LEVEL_OPTIONS.map((option) => option.id));
const toneIds = new Set(PHRASE_PACK_TONE_OPTIONS.map((option) => option.id));

const LEGACY_SCENE_MAP: Record<string, PhrasePackScene | null> = {
  hospital: null,
  other: null,
  "poker-table": "casino",
  floor: "casino",
};

const LEGACY_LEVEL_MAP: Record<string, PhrasePackLevel> = {
  zero: "entry",
  words: "basic",
  "short-conversation": "intermediate",
  "work-life": "advanced",
};

export function getPhrasePackSceneLabel(scene: PhrasePackScene): string {
  return PHRASE_PACK_SCENE_OPTIONS.find((option) => option.id === scene)?.label ?? scene;
}

export function getPhrasePackLevelLabel(level: PhrasePackLevel): string {
  return PHRASE_PACK_LEVEL_OPTIONS.find((option) => option.id === level)?.label ?? level;
}

export function getPhrasePackToneLabel(tone: PhrasePackTone): string {
  return PHRASE_PACK_TONE_OPTIONS.find((option) => option.id === tone)?.label ?? tone;
}

export function getCategoryIdForScene(scene: PhrasePackScene): string | null {
  return PHRASE_PACK_SCENE_OPTIONS.find((option) => option.id === scene)?.categoryId ?? null;
}

export function getCategoryIdsForScene(scene: PhrasePackScene): string[] {
  if (scene === "casino") return ["poker-table", "floor"];
  const categoryId = getCategoryIdForScene(scene);
  return categoryId ? [categoryId] : [];
}

export function getSceneCategoryHint(scene: PhrasePackScene): string {
  if (scene === "casino") {
    return "カジノ: ポーカー卓・フロア手続き（categoryId は poker-table または floor）";
  }
  const label = getPhrasePackSceneLabel(scene);
  const categoryId = getCategoryIdForScene(scene) ?? "other";
  return `${label}: ${categoryId}`;
}

export function sanitizePhrasePackProfile(input: Partial<PhrasePackProfile>): PhrasePackProfile {
  const scenes = (input.scenes ?? [])
    .map((scene) => LEGACY_SCENE_MAP[scene] ?? scene)
    .filter((scene): scene is PhrasePackScene => sceneIds.has(scene as PhrasePackScene));

  const dedupedScenes = [...new Set(scenes)].slice(0, PHRASE_PACK_SCENE_LIMIT);

  const normalizedScenes = dedupedScenes.includes("auto")
    ? (["auto"] as PhrasePackScene[])
    : dedupedScenes.length
      ? dedupedScenes
      : (["auto"] as PhrasePackScene[]);

  const rawLevel = input.level;
  const level =
    typeof rawLevel === "string" && levelIds.has(rawLevel as PhrasePackLevel)
      ? (rawLevel as PhrasePackLevel)
      : typeof rawLevel === "string" && rawLevel in LEGACY_LEVEL_MAP
        ? LEGACY_LEVEL_MAP[rawLevel]
        : "basic";

  const tone = toneIds.has(input.tone as PhrasePackTone)
    ? (input.tone as PhrasePackTone)
    : "auto";

  return {
    scenes: normalizedScenes,
    level,
    tone,
    details: (input.details ?? "").trim().slice(0, PHRASE_PACK_DETAILS_MAX_CHARS),
  };
}
