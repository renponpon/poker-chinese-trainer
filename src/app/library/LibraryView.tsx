"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteLocalPhrase,
  loadPhraseCategories,
  loadLocalPhrases,
  saveLocalPhrases,
  updateLocalPhrase,
} from "@/lib/local-phrases";
import {
  ACTIVE_TARGET_LANGUAGE_CODES,
  getLanguageLabel,
  LANGUAGE_CONFIGS,
} from "@/lib/languages";
import {
  ensureSrsItems,
  loadSrsData,
  saveSrsData,
  statusLabel,
} from "@/lib/srs";
import SpeechPlayButton from "@/components/SpeechPlayButton";
import { playSpeechForLang, prefetchSpeechForLang, primeSpeech } from "@/lib/speech";
import { cn } from "@/lib/utils";
import type { LanguageCode, Phrase, PhraseCategory, SrsItem, SrsStatus } from "@/lib/types";

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

function isUncategorized(categoryId: string | null): boolean {
  return !categoryId || categoryId === "uncategorized";
}

export default function LibraryView() {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [items, setItems] = useState<SrsItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState<LanguageFilter>("all");
  const [drillFilter, setDrillFilter] = useState<DrillFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<PhraseCategory[]>([]);

  useEffect(() => {
    primeSpeech();
    const localPhrases = loadLocalPhrases();
    setPhrases(localPhrases);
    setCategories(loadPhraseCategories());
    let stored = loadSrsData();
    stored = ensureSrsItems(localPhrases, stored);
    setItems(stored);
    setHydrated(true);
  }, []);

  const handleDelete = (id: string) => {
    if (!window.confirm("このフレーズをこの端末のライブラリから削除しますか？")) {
      return;
    }
    deleteLocalPhrase(id);
    const next = loadLocalPhrases();
    setPhrases(next);
    saveLocalPhrases(next);
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
        `選択した${selectedIds.size}件をこの端末のライブラリから削除しますか？`,
      )
    ) {
      return;
    }
    const next = phrases.filter((phrase) => !selectedIds.has(phrase.id));
    setPhrases(next);
    saveLocalPhrases(next);
    saveSrsData(items.filter((item) => !selectedIds.has(item.id)));
    setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
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

  const handleToggleDrill = (phrase: Phrase) => {
    const nextPhrases = updateLocalPhrase(phrase.id, {
      shouldDrill: !phrase.shouldDrill,
    });
    setPhrases(nextPhrases);
    const nextItems = ensureSrsItems(nextPhrases, loadSrsData());
    setItems(nextItems);
  };

  const handleCategoryChange = (phrase: Phrase, categoryId: string) => {
    const nextPhrases = updateLocalPhrase(phrase.id, {
      categoryId: categoryId === "uncategorized" ? null : categoryId,
    });
    setPhrases(nextPhrases);
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
      if (categoryFilter !== "all") {
        if (categoryFilter === "uncategorized" && !isUncategorized(p.categoryId)) {
          return false;
        }
        if (categoryFilter !== "uncategorized" && p.categoryId !== categoryFilter) {
          return false;
        }
      }
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
  }, [phrases, itemById, query, filter, categoryFilter, languageFilter, drillFilter]);

  const filterCount =
    (filter === "all" ? 0 : 1) +
    (categoryFilter === "all" ? 0 : 1) +
    (languageFilter === "all" ? 0 : 1) +
    (drillFilter === "all" ? 0 : 1);

  if (!hydrated) {
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
                対象言語
                <select
                  value={languageFilter}
                  onChange={(e) => setLanguageFilter(e.target.value as LanguageFilter)}
                  className="rounded-xl bg-neutral-950/80 px-3 py-2.5 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <option value="all">全て</option>
                  {ACTIVE_TARGET_LANGUAGE_CODES.map((language) => (
                    <option key={language} value={language}>
                      {getLanguageLabel(language)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs text-neutral-400">
              状況カテゴリ
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-xl bg-neutral-950/80 px-3 py-2.5 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                <option value="all">全て</option>
                <option value="uncategorized">未分類</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
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
            const category = categories.find((item) => item.id === p.categoryId);
            return (
              <div
                key={p.id}
                className="rounded-2xl bg-neutral-900/60 transition hover:bg-neutral-900"
              >
                <button
                  onClick={() => toggleExpanded(p.id)}
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-neutral-950/80 px-2 py-0.5 text-xs font-bold text-neutral-300">
                        {getLanguageLabel(p.sourceLanguage)}→{getLanguageLabel(p.targetLanguage)}
                      </span>
                      <span className="rounded-full bg-neutral-950/80 px-2 py-0.5 text-xs text-neutral-300">
                        {category?.label ?? "未分類"}
                      </span>
                      {!p.shouldDrill && (
                        <span className="rounded-full bg-neutral-950/80 px-2 py-0.5 text-xs font-bold text-neutral-300">
                          ライブラリのみ
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 truncate text-base text-neutral-200">
                      {p.sourceText || p.japanese}
                    </div>
                    <div className="mt-0.5 truncate text-xl font-medium text-emerald-300">
                      {p.targetText || p.chinese}
                    </div>
                  </div>
                  {p.shouldDrill ? <StatusBadge status={status} /> : null}
                </button>
                {expanded && (
                  <div className="border-t border-neutral-800/70 px-4 pb-4 pt-4">
                    <div className="rounded-2xl bg-neutral-950/60 p-4">
                      <div className="text-xs font-bold uppercase tracking-wide text-neutral-400">
                        {getLanguageLabel(p.sourceLanguage)}
                      </div>
                      <div className="mt-1 text-xl font-semibold leading-relaxed text-neutral-100">
                        {p.sourceText || p.japanese}
                      </div>
                      <div className="mt-4 text-xs font-bold uppercase tracking-wide text-neutral-400">
                        {getLanguageLabel(p.targetLanguage)}
                      </div>
                      <div className="mt-1 break-words [overflow-wrap:anywhere] text-2xl font-bold leading-relaxed text-emerald-300">
                        {p.targetText || p.chinese}
                      </div>
                      {(p.reading || p.pinyin) && (
                        <div className="mt-2 text-base tracking-wide text-neutral-400">
                          {p.reading || p.pinyin}
                        </div>
                      )}
                    </div>
                    {p.explanation && (
                      <div className="mt-4 whitespace-pre-wrap rounded-2xl bg-neutral-950/40 p-4 text-sm leading-relaxed text-neutral-300">
                        {p.explanation}
                      </div>
                    )}
                    <div className="mt-4 flex gap-2">
                      <SpeechPlayButton
                        play={(options) =>
                          playSpeechForLang(
                            p.targetText || p.chinese,
                            LANGUAGE_CONFIGS[p.targetLanguage].speechSynthesisCode,
                            options,
                          )
                        }
                        prefetch={() =>
                          prefetchSpeechForLang(
                            p.targetText || p.chinese,
                            LANGUAGE_CONFIGS[p.targetLanguage].speechSynthesisCode,
                          )
                        }
                        className="rounded-full bg-neutral-950/80 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
                        playingClassName="text-emerald-300"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.id);
                        }}
                        className="rounded-full bg-red-950/50 px-3 py-1.5 text-xs text-red-200 hover:bg-red-900/50"
                      >
                        削除
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-2 border-t border-neutral-800/70 pt-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs text-neutral-500">
                        カテゴリ
                        <select
                          value={p.categoryId ?? "uncategorized"}
                          onChange={(e) => handleCategoryChange(p, e.target.value)}
                          className="rounded-xl bg-neutral-950/80 px-3 py-2.5 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        >
                          <option value="uncategorized">未分類</option>
                          {categories.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleDrill(p);
                        }}
                        className={cn(
                          "self-end rounded-xl px-3 py-2.5 text-sm font-bold",
                          p.shouldDrill
                            ? "bg-neutral-950/80 text-neutral-300 hover:bg-neutral-800"
                            : "bg-emerald-500 text-neutral-950 hover:bg-emerald-400",
                        )}
                      >
                        {p.shouldDrill ? "ドリルから外す" : "ドリルに追加"}
                      </button>
                    </div>
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
