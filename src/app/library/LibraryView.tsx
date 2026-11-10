"use client";

import { useEffect, useMemo, useState } from "react";
import { completeSavedExplanation } from "@/lib/saved-phrase-explanation";
import { deleteSavedPhrases } from "@/application/phrase/delete-saved-phrases";
import { syncDrillSchedule } from "@/application/practice/drill-schedule";
import { manageDrillPhrase } from "@/application/practice/manage-drill-phrase";
import { useDataOwner } from "@/lib/translation-draft";
import { currentDataOwner } from "@/infrastructure/local/account-cache-storage";
import {
  loadLocalSrsItems,
  saveLocalSrsItems,
} from "@/infrastructure/local/srs-storage";
import { formatExplanationForReading } from "@/lib/explanation-format";
import {
  loadLocalPhrases,
  saveLocalPhrases,
  updateLocalPhrase,
} from "@/infrastructure/local/phrase-storage";
import {
  ACTIVE_TARGET_LANGUAGE_CODES,
  getLanguageLabel,
  LANGUAGE_CONFIGS,
} from "@/lib/languages";
import { statusLabel } from "@/lib/srs";
import SpeechPlayButton from "@/components/SpeechPlayButton";
import { playSpeechForLang, prefetchSpeechForLang, primeSpeech } from "@/lib/speech";
import { cn } from "@/lib/utils";
import { useLearningLanguage } from "@/lib/use-learning-language";
import {
  ACCOUNT_PHRASE_DATA_SYNCED_EVENT,
  deletePhrasesFromCloud,
  syncPhraseStateToCloud,
} from "@/lib/account-phrase-sync";
import type { LanguageCode, Phrase, SrsItem, SrsStatus } from "@/lib/types";

type Filter = "all" | SrsStatus;
type DrillFilter = "all" | "drill" | "library-only";
type LanguageFilter = "all" | LanguageCode;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "全て" },
  { id: "new", label: "新規" },
  { id: "learning", label: "学習中" },
  { id: "review", label: "復習中" },
  { id: "maintenance", label: "メンテ" },
  { id: "mastered", label: "習得" },
];

export default function LibraryView() {
  const owner = useDataOwner();
  const { targetLanguage, setTargetLanguage, languageReady } = useLearningLanguage();
  return (
    <LanguageLibrary
      key={`${owner}:${targetLanguage}`}
      owner={owner}
      targetLanguage={targetLanguage}
      setTargetLanguage={setTargetLanguage}
      languageReady={languageReady}
    />
  );
}

function LanguageLibrary({ owner, targetLanguage, setTargetLanguage, languageReady }: {
  owner: string;
  targetLanguage: LanguageCode;
  setTargetLanguage: (language: LanguageCode) => void;
  languageReady: boolean;
}) {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [items, setItems] = useState<SrsItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  const languageFilter: LanguageFilter = showAllLanguages ? "all" : targetLanguage;
  const [drillFilter, setDrillFilter] = useState<DrillFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    primeSpeech();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const localPhrases = loadLocalPhrases();
      setPhrases(localPhrases);
      const synced = syncDrillSchedule({
        phrases: localPhrases,
        items: loadLocalSrsItems(),
        storage: { saveSrsItems: saveLocalSrsItems },
      });
      setItems(synced.items);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refreshSyncedData = () => {
      const localPhrases = loadLocalPhrases();
      const synced = syncDrillSchedule({
        phrases: localPhrases,
        items: loadLocalSrsItems(),
        storage: { saveSrsItems: saveLocalSrsItems },
      });
      setPhrases(localPhrases);
      setItems(synced.items);
    };
    window.addEventListener(ACCOUNT_PHRASE_DATA_SYNCED_EVENT, refreshSyncedData);
    window.addEventListener("phrabit-phrases-updated", refreshSyncedData);
    return () => {
      window.removeEventListener(ACCOUNT_PHRASE_DATA_SYNCED_EVENT, refreshSyncedData);
      window.removeEventListener("phrabit-phrases-updated", refreshSyncedData);
    };
  }, []);

  const handleDelete = (id: string) => {
    if (!window.confirm("このフレーズをライブラリから削除しますか？\nログイン中は他の端末からも削除されます。")) {
      return;
    }
    const result = deleteSavedPhrases({
      phraseIds: [id],
      storage: {
        loadPhrases: loadLocalPhrases,
        savePhrases: saveLocalPhrases,
        loadSrsItems: loadLocalSrsItems,
        saveSrsItems: saveLocalSrsItems,
      },
    });
    setPhrases(result.phrases);
    setItems(result.srsItems);
    void deletePhrasesFromCloud([id]).catch((error) => {
      console.warn("[LibraryView] cloud delete failed", error);
    });
    setExpandedIds((prev) => {
      const nextExpanded = new Set(prev);
      nextExpanded.delete(id);
      return nextExpanded;
    });
    setSelectedIds((prev) => {
      const nextSelected = new Set(prev);
      nextSelected.delete(id);
      return nextSelected;
    });
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (
      !window.confirm(
        `選択した${selectedIds.size}件をライブラリから削除しますか？\nログイン中は他の端末からも削除されます。`,
      )
    ) {
      return;
    }
    const result = deleteSavedPhrases({
      phraseIds: [...selectedIds],
      storage: {
        loadPhrases: loadLocalPhrases,
        savePhrases: saveLocalPhrases,
        loadSrsItems: loadLocalSrsItems,
        saveSrsItems: saveLocalSrsItems,
      },
    });
    setPhrases(result.phrases);
    setItems(result.srsItems);
    void deletePhrasesFromCloud([...selectedIds]).catch((error) => {
      console.warn("[LibraryView] bulk cloud delete failed", error);
    });
    setSelectedIds(new Set());
    setExpandedIds((prev) => {
      const nextExpanded = new Set(prev);
      for (const id of selectedIds) {
        nextExpanded.delete(id);
      }
      return nextExpanded;
    });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddToDrill = (phrase: Phrase) => {
    if (currentDataOwner() !== owner) return;
    setActionError(null);
    try {
      const result = manageDrillPhrase({ phraseId: phrase.id, action: "resume", storage: {
        loadPhrases: loadLocalPhrases, savePhrases: saveLocalPhrases, updatePhrase: updateLocalPhrase,
        loadSrsItems: loadLocalSrsItems, saveSrsItems: saveLocalSrsItems,
      } });
      setPhrases(result.phrases);
      setItems(result.srsItems);
      const updated = result.phrases.find((item) => item.id === phrase.id);
      if (updated) void syncPhraseStateToCloud(updated, result.srsItems.find((item) => item.id === phrase.id) ?? null).catch(() => {
        if (currentDataOwner() === owner) setActionError("この端末への変更は保存済みですが、他の端末への同期は未完了です。");
      });
    } catch {
      setActionError("変更を完了できませんでした。保存内容を確認して再試行してください。");
    }
  };

  const itemById = useMemo(
    () => new Map(items.map((it) => [it.id, it])),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return phrases.filter((p) => {
      const it = itemById.get(p.id);
      const status: SrsStatus = it ? it.status : "new";
      if (!ACTIVE_TARGET_LANGUAGE_CODES.includes(p.targetLanguage)) return false;
      if (filter !== "all" && status !== filter) return false;
      if (languageFilter !== "all" && p.targetLanguage !== languageFilter) return false;
      if (drillFilter === "drill" && !p.shouldDrill) return false;
      if (drillFilter === "library-only" && p.shouldDrill) return false;
      if (!q) return true;
      return (
        p.japanese.toLowerCase().includes(q) ||
        p.chinese.toLowerCase().includes(q) ||
        p.pinyin.toLowerCase().includes(q) ||
        p.sourceText.toLowerCase().includes(q) ||
        p.targetText.toLowerCase().includes(q) ||
        p.reading.toLowerCase().includes(q)
      );
    });
  }, [phrases, itemById, query, filter, languageFilter, drillFilter]);

  const filterCount =
    (filter === "all" ? 0 : 1) +
    (languageFilter === "all" ? 0 : 1) +
    (drillFilter === "all" ? 0 : 1);

  if (!hydrated || !languageReady) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-neutral-500">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setFilterOpen((value) => !value)}
          className="flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-sm font-bold text-neutral-200 hover:bg-neutral-800"
        >
          <FilterIcon />
          フィルター
          {filterCount > 0 && (
            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs text-neutral-950">
              {filterCount}
            </span>
          )}
        </button>
        <button
          onClick={handleBulkDelete}
          disabled={selectedIds.size === 0}
          className="rounded-full bg-red-950/50 px-3 py-1.5 text-xs font-bold text-red-200 hover:bg-red-900/50 disabled:cursor-not-allowed disabled:bg-neutral-900 disabled:text-neutral-600"
        >
          消去{selectedIds.size ? ` (${selectedIds.size})` : ""}
        </button>
      </div>

      {actionError && <p role="alert" className="text-sm text-amber-200">{actionError}</p>}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="日本語・翻訳・読みで検索"
        className="w-full rounded-2xl bg-neutral-900 px-4 py-3 text-base text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      />

      {filterOpen && (
        <div className="grid gap-3 rounded-2xl bg-neutral-900/60 p-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  filter === f.id
                    ? "bg-emerald-500 text-neutral-950"
                    : "bg-neutral-950/80 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ACTIVE_TARGET_LANGUAGE_CODES.length > 1 && (
              <label className="flex flex-col gap-1 text-xs text-neutral-400">
                学習言語（全画面共通）
                <select
                  value={languageFilter}
                  onChange={(event) => {
                    const value = event.target.value as LanguageFilter;
                    setShowAllLanguages(value === "all");
                    setSelectedIds(new Set());
                    if (value !== "all") setTargetLanguage(value);
                  }}
                  className="rounded-xl bg-neutral-950/80 px-3 py-2.5 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <option value="all">全て（一時表示）</option>
                  {ACTIVE_TARGET_LANGUAGE_CODES.map((language) => (
                    <option key={language} value={language}>
                      {getLanguageLabel(language)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs text-neutral-400">
              ドリル対象
              <select
                value={drillFilter}
                onChange={(e) => setDrillFilter(e.target.value as DrillFilter)}
                className="rounded-xl bg-neutral-950/80 px-3 py-2.5 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                <option value="all">全て</option>
                <option value="drill">ドリル対象</option>
                <option value="library-only">ライブラリのみ</option>
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-neutral-900/60 px-4 py-10 text-sm text-neutral-500">
            該当するフレーズがありません
          </div>
        ) : (
          filtered.map((p) => {
            const it = itemById.get(p.id);
            const status: SrsStatus = it ? it.status : "new";
            const expanded = expandedIds.has(p.id);
            return (
              <div
                key={p.id}
                className="rounded-2xl bg-neutral-900/60 transition hover:bg-neutral-900"
              >
                <button
                  onClick={() => toggleExpanded(p.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelected(p.id);
                    }}
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-bold",
                      selectedIds.has(p.id)
                        ? "bg-red-500 text-white"
                        : "bg-neutral-950/80 text-transparent",
                    )}
                    aria-label="削除対象として選択"
                    role="checkbox"
                    aria-checked={selectedIds.has(p.id)}
                  >
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    {!p.shouldDrill && (
                      <span className="mb-1.5 inline-block rounded-full bg-neutral-950/80 px-2 py-0.5 text-xs font-bold text-neutral-300">
                        ライブラリのみ
                      </span>
                    )}
                    <div className={cn("text-base text-neutral-200", expanded ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "truncate")}>
                      {p.sourceText || p.japanese}
                    </div>
                    <div className={cn("mt-0.5 text-xl font-medium text-emerald-300", expanded ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "truncate")}>
                      {p.targetText || p.chinese}
                    </div>
                    {expanded && (p.reading || p.pinyin) && (
                      <div className="mt-1 break-words text-base text-neutral-400">{p.reading || p.pinyin}</div>
                    )}
                  </div>
                  {p.shouldDrill ? <StatusBadge status={status} /> : null}
                </button>
                {expanded && (
                  <div className="border-t border-neutral-800/70 px-4 pb-4 pt-4">
                    <section className="rounded-2xl bg-neutral-950/40 p-4 text-sm text-neutral-300">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="min-w-0 font-bold">使い方・想定返答</h2>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <SpeechPlayButton
                            play={(options) => playSpeechForLang(p.targetText || p.chinese, LANGUAGE_CONFIGS[p.targetLanguage].speechSynthesisCode, options)}
                            prefetch={() => prefetchSpeechForLang(p.targetText || p.chinese, LANGUAGE_CONFIGS[p.targetLanguage].speechSynthesisCode)}
                            className="min-h-9 rounded-full bg-neutral-950/80 px-3 text-xs text-neutral-300 hover:bg-neutral-800"
                            playingClassName="text-emerald-300"
                          />
                          <button
                            type="button"
                            onClick={() => handleDelete(p.id)}
                            className="min-h-9 rounded-full bg-red-950/50 px-3 text-xs text-red-200 hover:bg-red-900/50"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                      {p.explanation?.trim() ? (
                        <div className="mt-2 whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{formatExplanationForReading(p.explanation, { direction: p.direction, japaneseText: p.japanese, chineseText: p.chinese })}</div>
                      ) : (
                        <>
                          <p className="mt-2">このフレーズにはまだ解説がありません。</p>
                          <button type="button" className="mt-2 rounded-xl bg-neutral-900 px-3 py-2" onClick={() => void completeSavedExplanation(p)}>解説を生成・再試行する</button>
                        </>
                      )}
                    </section>
                    {!p.shouldDrill && (
                      <button
                        type="button"
                        onClick={() => handleAddToDrill(p)}
                        className="mt-4 w-full rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-bold text-neutral-950 hover:bg-emerald-400"
                      >
                        ドリルに追加
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SrsStatus }) {
  const palette: Record<SrsStatus, string> = {
    new: "bg-neutral-950/80 text-neutral-400",
    learning: "bg-neutral-950/80 text-neutral-300",
    review: "bg-neutral-950/80 text-emerald-200",
    maintenance: "bg-neutral-950/80 text-emerald-200",
    mastered: "bg-emerald-500 text-neutral-950",
  };
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
        palette[status],
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function FilterIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}
