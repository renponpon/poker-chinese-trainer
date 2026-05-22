"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuthHeaders } from "@/lib/auth-headers";
import { addLocalPhrase } from "@/lib/local-phrases";
import { enqueuePackExplanationJob } from "@/lib/pending-pack-explanations";
import {
  PHRASE_PACK_DETAILS_MAX_CHARS,
  PHRASE_PACK_PROFILE_KEY,
  PHRASE_PACK_SCENE_LIMIT,
  PHRASE_PACK_LEVEL_OPTIONS,
  PHRASE_PACK_SCENE_OPTIONS,
  PHRASE_PACK_TONE_OPTIONS,
  getCategoryIdsForScene,
  sanitizePhrasePackProfile,
} from "@/lib/personal-phrase-pack";
import {
  detectDuplicateInList,
  detectDuplicatePhrase,
  getRecentChineseHints,
  type PhraseDuplicateKind,
} from "@/lib/phrase-dedupe";
import type {
  GeneratedPhrasePackItem,
  Phrase,
  PhrasePackLevel,
  PhrasePackProfile,
  PhrasePackScene,
  PhrasePackTone,
} from "@/lib/types";

type GeneratedPackItem = GeneratedPhrasePackItem & {
  id: string;
};

type PreviewItem = GeneratedPackItem & {
  duplicateKind: PhraseDuplicateKind;
  matchedChinese: string | null;
};

type Props = {
  phrases: Phrase[];
  buttonClassName?: string;
  onSaved: (phrases: Phrase[]) => void;
};

const defaultProfile: PhrasePackProfile = {
  scenes: ["auto"],
  level: "basic",
  tone: "auto",
  details: "",
};

const GENERATION_STEPS = [30, 65, 90, 98] as const;

export default function PersonalPhrasePackFlow({
  phrases,
  buttonClassName,
  onSaved,
}: Props) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<PhrasePackProfile>(defaultProfile);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [packRequestId, setPackRequestId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PHRASE_PACK_PROFILE_KEY);
      if (!raw) return;
      setProfile(sanitizePhrasePackProfile(JSON.parse(raw) as Partial<PhrasePackProfile>));
    } catch {
      // 壊れた保存値は無視して初期値を使う。
    }
  }, []);

  const categoryHints = useMemo(
    () => profile.scenes.flatMap((scene) => getCategoryIdsForScene(scene)),
    [profile.scenes],
  );

  useEffect(() => {
    if (!loading) {
      setLoadingProgress(0);
      return;
    }

    let step = 0;
    setLoadingProgress(GENERATION_STEPS[0]);

    const timer = window.setInterval(() => {
      step = Math.min(step + 1, GENERATION_STEPS.length - 1);
      setLoadingProgress(GENERATION_STEPS[step]);
    }, 2500);

    return () => window.clearInterval(timer);
  }, [loading]);

  const handleSceneToggle = (scene: PhrasePackScene) => {
    setProfile((current) => {
      if (scene === "auto") {
        return { ...current, scenes: ["auto"] };
      }

      const withoutAuto = current.scenes.filter((item) => item !== "auto");
      const hasScene = withoutAuto.includes(scene);
      if (hasScene) {
        const nextScenes = withoutAuto.filter((item) => item !== scene);
        return { ...current, scenes: nextScenes };
      }
      if (withoutAuto.length >= PHRASE_PACK_SCENE_LIMIT) return current;
      return { ...current, scenes: [...withoutAuto, scene] };
    });
  };

  const handleGenerate = async () => {
    setError("");
    const normalized = sanitizePhrasePackProfile(profile);
    if (!normalized.scenes.length) {
      setError("場面を1つ以上選んでください。");
      return;
    }

    setLoading(true);
    setPreview([]);
    setSelectedIds(new Set());
    setPackRequestId("");

    try {
      window.localStorage.setItem(PHRASE_PACK_PROFILE_KEY, JSON.stringify(normalized));
      const existingChinese = getRecentChineseHints(phrases, categoryHints, 50);
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/phrase/generate-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ profile: normalized, existingChinese }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "フレーズ生成に失敗しました");
      }

      const rawItems = Array.isArray(data.phrases) ? data.phrases : [];
      const items = buildPreviewItems(rawItems as GeneratedPackItem[], phrases);
      if (!items.length) {
        throw new Error("生成結果が空でした。もう一度お試しください。");
      }

      const requestId = typeof data.requestId === "string" ? data.requestId : "";
      if (!requestId) {
        throw new Error("生成結果の識別子が取得できませんでした。");
      }

      setPackRequestId(requestId);
      setPreview(items);
      setSelectedIds(
        new Set(
          items
            .filter((item) => !item.duplicateKind)
            .map((item) => item.id),
        ),
      );
      setLoadingProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "フレーズ生成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    const selected = preview.filter((item) => selectedIds.has(item.id));
    if (!selected.length) {
      setError("追加するフレーズを1つ以上選んでください。");
      return;
    }
    if (!packRequestId) {
      setError("フレーズパックの情報が見つかりません。もう一度作成してください。");
      return;
    }

    setError("");
    const createdAt = new Date().toISOString();
    const saved = [...selected].reverse().map((item) =>
      addLocalPhrase({
        id: item.id,
        japanese: item.japanese,
        chinese: item.chinese,
        pinyin: item.pinyin,
        explanation: "",
        audioUrl: null,
        createdAt,
        direction: "ja-to-zh",
        categoryId: item.categoryId,
        shouldDrill: true,
        source: "prototype",
        usedAt: null,
      }),
    ).reverse();

    void enqueuePackExplanationJob({
      packRequestId,
      phrases: saved,
    });

    onSaved(saved);
    setOpen(false);
    setPreview([]);
    setPackRequestId("");
  };

  const handleBackToQuestions = () => {
    setPreview([]);
    setPackRequestId("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          "rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-neutral-950 hover:bg-emerald-400"
        }
      >
        追加
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-end bg-black/70 p-3 sm:items-center sm:justify-center">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-neutral-950 p-4 shadow-2xl shadow-black/60 sm:max-w-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 flex-1 text-lg font-extrabold leading-snug text-neutral-100 sm:text-xl">
                フレーズを作成します
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-full px-3 py-2 text-sm font-bold text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
              >
                閉じる
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            {loading ? (
              <GenerationProgress progress={loadingProgress} />
            ) : preview.length === 0 ? (
              <div className="mt-5 space-y-6">
                <QuestionBlock
                  title="どんな場面で使いたいですか？"
                  hint="最大3つ"
                >
                  <div className="grid grid-cols-2 gap-2">
                    {PHRASE_PACK_SCENE_OPTIONS.map((option) => (
                      <ChoiceButton
                        key={option.id}
                        selected={profile.scenes.includes(option.id)}
                        onClick={() => handleSceneToggle(option.id)}
                      >
                        {option.label}
                      </ChoiceButton>
                    ))}
                  </div>
                </QuestionBlock>

                <QuestionBlock title="中国語のレベルはどれに近いですか？">
                  <OptionList
                    options={PHRASE_PACK_LEVEL_OPTIONS}
                    value={profile.level}
                    onChange={(level) => setProfile((current) => ({ ...current, level }))}
                  />
                </QuestionBlock>

                <QuestionBlock title="どんな言い方に近づけたいですか？">
                  <OptionList
                    options={PHRASE_PACK_TONE_OPTIONS}
                    value={profile.tone}
                    onChange={(tone) => setProfile((current) => ({ ...current, tone }))}
                  />
                </QuestionBlock>

                <QuestionBlock title="具体的にどんな状況ですか？（スキップ可）">
                  <textarea
                    value={profile.details}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        details: event.target.value.slice(0, PHRASE_PACK_DETAILS_MAX_CHARS),
                      }))
                    }
                    placeholder={"例: レストランで辛さやおすすめを聞きたい\n例: 上海出張で納期を確認したい"}
                    className="min-h-[96px] w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-base text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-emerald-500"
                  />
                  <div className="mt-1 text-right text-xs text-neutral-500">
                    {profile.details.length}/{PHRASE_PACK_DETAILS_MAX_CHARS}
                  </div>
                </QuestionBlock>

                <button
                  type="button"
                  disabled={profile.scenes.length === 0}
                  onClick={handleGenerate}
                  className="w-full rounded-2xl bg-emerald-500 px-5 py-4 text-base font-extrabold text-neutral-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                >
                  フレーズを作成
                </button>
              </div>
            ) : (
              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm text-neutral-400">
                    追加したいフレーズを選んでください。保存後すぐドリルを始められます。
                  </div>
                  <button
                    type="button"
                    onClick={handleBackToQuestions}
                    className="text-sm font-bold text-neutral-400 hover:text-neutral-100"
                  >
                    質問に戻る
                  </button>
                </div>
                <div className="space-y-3">
                  {preview.map((item) => {
                    const checked = selectedIds.has(item.id);
                    return (
                      <label
                        key={item.id}
                        className="block rounded-2xl bg-neutral-900 p-4"
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelection(item.id, setSelectedIds)}
                            className="mt-1 h-5 w-5 accent-emerald-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-base font-bold text-neutral-100">
                                {item.japanese}
                              </div>
                              {item.duplicateKind && (
                                <span className="rounded-full bg-yellow-500/15 px-2 py-1 text-xs font-bold text-yellow-200">
                                  {item.duplicateKind === "exact" ? "既にあり" : "類似あり"}
                                </span>
                              )}
                            </div>
                            <div className="mt-2 text-xl font-bold text-white">
                              {item.chinese}
                            </div>
                            <div className="mt-1 text-sm text-neutral-400">
                              {item.pinyin}
                            </div>
                            {item.matchedChinese && (
                              <div className="mt-2 text-xs text-yellow-200/80">
                                近い既存フレーズ: {item.matchedChinese}
                              </div>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={selectedIds.size === 0}
                  onClick={handleSave}
                  className="mt-4 w-full rounded-2xl bg-emerald-500 px-5 py-4 text-base font-extrabold text-neutral-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                >
                  {`${selectedIds.size}件をドリルに追加`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function QuestionBlock({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-sm font-bold leading-snug text-neutral-100 sm:text-base">
          {title}
        </h3>
        {hint && (
          <span className="shrink-0 text-xs text-neutral-500 sm:text-sm">{hint}</span>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function GenerationProgress({ progress }: { progress: number }) {
  return (
    <div className="mt-10 px-1 pb-6">
      <div className="h-2 overflow-hidden rounded-full bg-neutral-900">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function ChoiceButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        selected
          ? "rounded-2xl border border-emerald-400 bg-emerald-500/15 px-2.5 py-3 text-center text-xs font-bold leading-snug text-emerald-100 sm:px-3 sm:text-sm"
          : "rounded-2xl border border-neutral-800 bg-neutral-900 px-2.5 py-3 text-center text-xs font-bold leading-snug text-neutral-300 hover:border-neutral-600 sm:px-3 sm:text-sm"
      }
    >
      {children}
    </button>
  );
}

function OptionList<T extends PhrasePackLevel | PhrasePackTone>({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: T; label: string; description?: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={
            value === option.id
              ? "w-full rounded-2xl border border-emerald-400 bg-emerald-500/15 p-4 text-left"
              : "w-full rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-left hover:border-neutral-600"
          }
        >
          <div className="text-sm font-bold leading-snug text-neutral-100">{option.label}</div>
          {option.description && (
            <div className="mt-1 text-xs leading-snug text-neutral-500 sm:text-sm">
              {option.description}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

function buildPreviewItems(items: GeneratedPackItem[], phrases: Phrase[]): PreviewItem[] {
  const previousChinese: string[] = [];
  return items.map((item) => {
    const existingDuplicate = detectDuplicatePhrase(item.chinese, phrases);
    const packDuplicate = detectDuplicateInList(item.chinese, previousChinese);
    previousChinese.push(item.chinese);
    const duplicateKind = existingDuplicate.kind ?? packDuplicate;
    return {
      ...item,
      explanation: "",
      duplicateKind,
      matchedChinese: existingDuplicate.matchedChinese,
    };
  });
}

function toggleSelection(
  id: string,
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
  setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });
}
