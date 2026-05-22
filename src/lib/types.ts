export type PhraseDirection = "ja-to-zh" | "zh-to-ja";

export type PhraseSource = "manual" | "conversation" | "prototype";

export type Phrase = {
  id: string;
  japanese: string;
  chinese: string;
  pinyin: string;
  explanation: string;
  audioUrl: string | null;
  createdAt: string;
  direction: PhraseDirection;
  categoryId: string | null;
  shouldDrill: boolean;
  source: PhraseSource;
  usedAt: string | null;
};

export type Score = 1 | 2 | 3;

export type SrsStatus = "new" | "learning" | "review" | "maintenance" | "mastered";

export type SrsItem = {
  id: string;
  status: SrsStatus;
  nextReviewAt: number;
  intervalDays: number;
  easeFactor: number;
  consecutiveGood: number;
  lastScore: Score | null;
  lastReviewedAt: number | null;
};

export type GeneratedPhrase = {
  direction: PhraseDirection;
  japanese: string;
  chinese: string;
  pinyin: string;
  explanation: string;
};

export type PhrasePackScene =
  | "auto"
  | "poker-table"
  | "floor"
  | "restaurant"
  | "shopping"
  | "transport"
  | "hotel"
  | "work"
  | "daily";

export type PhrasePackLevel = "entry" | "basic" | "intermediate" | "advanced";

export type PhrasePackTone =
  | "short"
  | "natural"
  | "polite"
  | "detailed"
  | "auto";

export type PhrasePackProfile = {
  scenes: PhrasePackScene[];
  level: PhrasePackLevel;
  tone: PhrasePackTone;
  details: string;
};

export type GeneratedPhrasePackItem = GeneratedPhrase & {
  categoryId: string | null;
};

export type PhraseCategory = {
  id: string;
  label: string;
  builtIn: boolean;
  createdAt: string;
};
